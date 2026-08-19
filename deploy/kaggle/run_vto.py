#!/usr/bin/env python3
"""Bootstrap LuxeForLess VTO on Kaggle GPU + expose via ngrok."""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

REPO_URL = os.environ.get(
    "LUXEFORLESS_REPO_URL",
    "https://github.com/mintukumar0000/luxeforless.git",
)
NGROK_AUTHTOKEN = os.environ.get("NGROK_AUTHTOKEN", "")


def run(cmd: str, cwd: str | None = None) -> None:
    print(f"\n$ {cmd}\n", flush=True)
    subprocess.check_call(cmd, shell=True, cwd=cwd)


def main() -> None:
    if not NGROK_AUTHTOKEN:
        print("ERROR: Set NGROK_AUTHTOKEN in Kaggle notebook secrets or environment.")
        sys.exit(1)

    work = "/kaggle/working/luxeforless"
    if not os.path.isdir(work):
        run(f"git clone --depth 1 {REPO_URL} {work}")

    vto_dir = f"{work}/services/vto"
    vendor_dir = f"{work}/vendor/fashn-vton-1.5"

    if not os.path.isdir(vendor_dir) or not os.listdir(vendor_dir):
        os.makedirs(f"{work}/vendor", exist_ok=True)
        run(
            "git clone --depth 1 https://github.com/fashn-ai/fashn-vton-1.5.git "
            f"{vendor_dir}"
        )
        # Apple Silicon patch not needed on CUDA, but harmless if present
        mmdit = f"{vendor_dir}/src/fashn_vton/tryon_mmdit.py"
        if os.path.exists(mmdit):
            with open(mmdit) as f:
                src = f.read()
            if "float64" in src:
                with open(mmdit, "w") as f:
                    f.write(src.replace("float64", "float32"))

    run("pip install -q pyngrok uvicorn[standard] python-multipart mediapipe==0.10.21 rembg")
    run(f"pip install -q -e {vendor_dir}")

    weights_dir = f"{vto_dir}/weights"
    os.makedirs(weights_dir, exist_ok=True)
    if not os.path.exists(f"{weights_dir}/model.safetensors"):
        print("\n[3/4] Downloading model weights (~2GB, 10-15 min)...")
        run(f"python {vendor_dir}/scripts/download_weights.py --weights-dir {weights_dir}")
    else:
        print("\n[3/4] Weights already downloaded — skipping")

    os.environ["WEIGHTS_DIR"] = weights_dir
    os.environ["RESULTS_DIR"] = f"{vto_dir}/results"
    os.environ["VTO_NUM_TIMESTEPS"] = os.environ.get("VTO_NUM_TIMESTEPS", "4")
    os.environ["VTO_MAX_IMAGE_SIZE"] = os.environ.get("VTO_MAX_IMAGE_SIZE", "512")
    os.environ["VTO_DEVICE"] = "cuda"

    print("\n[4/4] Starting ngrok tunnel + VTO server...")
    from pyngrok import ngrok

    ngrok.set_auth_token(NGROK_AUTHTOKEN)
    tunnel = ngrok.connect(8000, bind_tls=True)
    public_url = tunnel.public_url
    print("\n" + "=" * 60)
    print("VTO PUBLIC URL (paste into Vercel env):")
    print(public_url)
    print("Health check:", f"{public_url}/health")
    print("=" * 60)
    print("Keep this notebook running while testing try-on!\n")

    os.chdir(vto_dir)
    sys.path.insert(0, vto_dir)
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    main()
