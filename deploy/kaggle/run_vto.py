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


def pip_install(*packages: str) -> None:
    run(f"{sys.executable} -m pip install -q " + " ".join(packages))


def setup_python_path(vto_dir: str, vendor_dir: str) -> None:
    """Ensure FASHN + VTO modules resolve in this Python process."""
    vendor_src = os.path.join(vendor_dir, "src")
    for path in (vendor_src, vto_dir):
        if path not in sys.path:
            sys.path.insert(0, path)
    extra = f"{vendor_src}:{vto_dir}"
    current = os.environ.get("PYTHONPATH", "")
    if extra not in current:
        os.environ["PYTHONPATH"] = f"{extra}:{current}" if current else extra


def download_core_weights(weights_dir: str) -> None:
    """Download try-on + pose + human-parser HF files (no GPU init — avoids 78% hang)."""
    dwpose_dir = os.path.join(weights_dir, "dwpose")
    os.makedirs(dwpose_dir, exist_ok=True)

    run(
        f"{sys.executable} -c \""
        f"from huggingface_hub import hf_hub_download; "
        f"import os; "
        f"w='{weights_dir}'; d=os.path.join(w,'dwpose'); "
        f"os.makedirs(d, exist_ok=True); "
        f"hf_hub_download(repo_id='fashn-ai/fashn-vton-1.5', filename='model.safetensors', local_dir=w); "
        f"print('TryOnModel OK'); "
        f"hf_hub_download(repo_id='fashn-ai/DWPose', filename='yolox_l.onnx', local_dir=d); "
        f"hf_hub_download(repo_id='fashn-ai/DWPose', filename='dw-ll_ucoco_384.onnx', local_dir=d); "
        f"print('DWPose OK'); "
        f"repo='fashn-ai/fashn-human-parser'; "
        f"[hf_hub_download(repo_id=repo, filename=f) for f in "
        f"('config.json','model.safetensors','preprocessor_config.json')]; "
        f"print('HumanParser weights cached')\""
    )


def patch_vendor(vendor_dir: str) -> None:
    """Kaggle-specific fixes for FASHN vendor code."""
    mmdit = f"{vendor_dir}/src/fashn_vton/tryon_mmdit.py"
    if os.path.exists(mmdit):
        with open(mmdit) as f:
            src = f.read()
        if "float64" in src:
            with open(mmdit, "w") as f:
                f.write(src.replace("float64", "float32"))

    pipeline_py = f"{vendor_dir}/src/fashn_vton/pipeline.py"
    if not os.path.exists(pipeline_py):
        return
    with open(pipeline_py) as f:
        src = f.read()
    needle = 'hp_device = "cuda" if self.device.type == "cuda" else "cpu"'
    replacement = (
        'hp_device = os.environ.get("VTO_HP_DEVICE") or '
        '("cuda" if self.device.type == "cuda" else "cpu")'
    )
    if needle in src and replacement not in src:
        with open(pipeline_py, "w") as f:
            f.write(src.replace(needle, replacement))
        print("Patched FASHN pipeline: human parser respects VTO_HP_DEVICE", flush=True)


def preload_pipeline(vto_dir: str, vendor_dir: str) -> None:
    """Load all models before first user request (human parser on CPU to save VRAM)."""
    print("\n[3.5/4] Pre-loading AI pipeline (~3-8 min first time)...", flush=True)
    print("  Human parser runs on CPU (saves T4 VRAM for try-on model)", flush=True)
    vendor_src = os.path.join(vendor_dir, "src")
    # Fresh subprocess so pip install -e is visible (same interpreter as notebook)
    run(
        f"{sys.executable} -c \""
        f"import sys, os; "
        f"sys.path.insert(0, '{vendor_src}'); "
        f"sys.path.insert(0, '{vto_dir}'); "
        f"os.chdir('{vto_dir}'); "
        f"from app.main import get_pipeline; "
        f"get_pipeline(); "
        f"print('AI pipeline ready — try-ons should take ~1-3 min now')\""
    )


def core_weights_ready(weights_dir: str) -> bool:
    return (
        os.path.exists(os.path.join(weights_dir, "model.safetensors"))
        and os.path.exists(os.path.join(weights_dir, "dwpose", "yolox_l.onnx"))
        and os.path.exists(os.path.join(weights_dir, "dwpose", "dw-ll_ucoco_384.onnx"))
    )


def wait_for_port(port: int, timeout: int = 60) -> bool:
    import socket

    for _ in range(timeout):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(1)
    return False


def start_vto_server(vto_dir: str, vendor_dir: str) -> None:
    vendor_src = os.path.join(vendor_dir, "src")
    os.chdir(vto_dir)
    for path in (vendor_src, vto_dir):
        if path not in sys.path:
            sys.path.insert(0, path)
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
    patch_vendor(vendor_dir)

    # Skip mediapipe on Kaggle — conflicts with protobuf/tensorflow; body validation uses basic fallback
    pip_install("pyngrok", "uvicorn[standard]", "python-multipart", "rembg")
    pip_install("-e", vendor_dir)
    setup_python_path(vto_dir, vendor_dir)
    run(f'{sys.executable} -c "from fashn_vton import TryOnPipeline; print(\'fashn_vton import OK\')"')

    weights_dir = f"{vto_dir}/weights"
    os.makedirs(weights_dir, exist_ok=True)
    if not core_weights_ready(weights_dir):
        print("\n[3/4] Downloading core model weights (~2GB, 5-10 min)...", flush=True)
        download_core_weights(weights_dir)
    else:
        print("\n[3/4] Core weights already present — skipping download", flush=True)

    os.environ["WEIGHTS_DIR"] = weights_dir
    os.environ["RESULTS_DIR"] = f"{vto_dir}/results"
    os.environ["VTO_NUM_TIMESTEPS"] = os.environ.get("VTO_NUM_TIMESTEPS", "20")
    os.environ["VTO_MAX_IMAGE_SIZE"] = os.environ.get("VTO_MAX_IMAGE_SIZE", "768")
    os.environ["VTO_PREPROCESS_PERSON"] = "true"
    os.environ["VTO_ENHANCE_RESULT"] = "true"
    os.environ["VTO_DEVICE"] = "cuda"
    # Human parser on CPU avoids T4 VRAM hang at ~78% layer load
    os.environ["VTO_HP_DEVICE"] = "cpu"

    preload_pipeline(vto_dir, vendor_dir)

    print("\n[4/4] Starting VTO server in background...", flush=True)
    server = threading.Thread(target=start_vto_server, args=(vto_dir, vendor_dir), daemon=True)
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
