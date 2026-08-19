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
URL_FILE = "/kaggle/working/VTO_PUBLIC_URL.txt"


def run(cmd: str, cwd: str | None = None) -> None:
    print(f"\n$ {cmd}\n", flush=True)
    subprocess.check_call(cmd, shell=True, cwd=cwd)


def download_core_weights(weights_dir: str, vendor_dir: str) -> None:
    """Download try-on + pose weights only. Human parser loads lazily on first try-on."""
    dwpose_dir = os.path.join(weights_dir, "dwpose")
    os.makedirs(dwpose_dir, exist_ok=True)

    run(
        f"python -c \""
        f"from huggingface_hub import hf_hub_download; "
        f"import os; "
        f"w='{weights_dir}'; d=os.path.join(w,'dwpose'); "
        f"os.makedirs(d, exist_ok=True); "
        f"hf_hub_download(repo_id='fashn-ai/fashn-vton-1.5', filename='model.safetensors', local_dir=w); "
        f"print('TryOnModel OK'); "
        f"hf_hub_download(repo_id='fashn-ai/DWPose', filename='yolox_l.onnx', local_dir=d); "
        f"hf_hub_download(repo_id='fashn-ai/DWPose', filename='dw-ll_ucoco_384.onnx', local_dir=d); "
        f"print('DWPose OK'); "
        f"print('Skipping human-parser preload — loads automatically on first try-on')\""
    )


def core_weights_ready(weights_dir: str) -> bool:
    return (
        os.path.exists(os.path.join(weights_dir, "model.safetensors"))
        and os.path.exists(os.path.join(weights_dir, "dwpose", "yolox_l.onnx"))
        and os.path.exists(os.path.join(weights_dir, "dwpose", "dw-ll_ucoco_384.onnx"))
    )
    import socket

    for _ in range(timeout):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(1)
    return False


def start_vto_server(vto_dir: str) -> None:
    os.chdir(vto_dir)
    sys.path.insert(0, vto_dir)
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info")


def publish_url(public_url: str) -> None:
    with open(URL_FILE, "w") as f:
        f.write(public_url)
    print("\n" + "=" * 60, flush=True)
    print("VTO PUBLIC URL (paste into Vercel env):", flush=True)
    print(public_url, flush=True)
    print("Health check:", f"{public_url}/health", flush=True)
    print("Saved to:", URL_FILE, flush=True)
    print("=" * 60, flush=True)
    print("Keep this notebook running while testing try-on!\n", flush=True)


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
        mmdit = f"{vendor_dir}/src/fashn_vton/tryon_mmdit.py"
        if os.path.exists(mmdit):
            with open(mmdit) as f:
                src = f.read()
            if "float64" in src:
                with open(mmdit, "w") as f:
                    f.write(src.replace("float64", "float32"))

    # Skip mediapipe on Kaggle — conflicts with protobuf/tensorflow; body validation uses basic fallback
    run("pip install -q pyngrok uvicorn[standard] python-multipart rembg")
    run(f"pip install -q -e {vendor_dir}")

    weights_dir = f"{vto_dir}/weights"
    os.makedirs(weights_dir, exist_ok=True)
    if not core_weights_ready(weights_dir):
        print("\n[3/4] Downloading core model weights (~2GB, 5-10 min)...", flush=True)
        download_core_weights(weights_dir, vendor_dir)
    else:
        print("\n[3/4] Core weights already present — skipping download", flush=True)
        print("  (Human parser loads on first try-on — do not preload)", flush=True)

    os.environ["WEIGHTS_DIR"] = weights_dir
    os.environ["RESULTS_DIR"] = f"{vto_dir}/results"
    os.environ["VTO_NUM_TIMESTEPS"] = os.environ.get("VTO_NUM_TIMESTEPS", "4")
    os.environ["VTO_MAX_IMAGE_SIZE"] = os.environ.get("VTO_MAX_IMAGE_SIZE", "512")
    os.environ["VTO_DEVICE"] = "cuda"

    print("\n[4/4] Starting VTO server in background...", flush=True)
    server = threading.Thread(target=start_vto_server, args=(vto_dir,), daemon=True)
    server.start()

    if not wait_for_port(8000):
        print("ERROR: VTO server did not start on port 8000", flush=True)
        sys.exit(1)
    print("VTO server ready on port 8000", flush=True)

    from pyngrok import ngrok

    print("Connecting ngrok tunnel...", flush=True)
    ngrok.set_auth_token(NGROK_AUTHTOKEN)
    for t in ngrok.get_tunnels():
        ngrok.disconnect(t.public_url)

    tunnel = ngrok.connect(8000, bind_tls=True)
    publish_url(tunnel.public_url)

    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
