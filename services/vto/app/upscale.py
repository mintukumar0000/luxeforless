"""2x ultra upscale for local try-on — Real-ESRGAN when available, else enhanced Lanczos."""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", "./weights")
REALESRGAN_X2_PATH = os.path.join(WEIGHTS_DIR, "RealESRGAN_x2plus.pth")

_upsampler = None


def get_upscale_factor() -> int:
    ultra = os.environ.get("VTO_ULTRA_MODE", "").lower() in ("1", "true", "yes")
    default = "2" if ultra else "0"
    try:
        factor = int(os.environ.get("VTO_UPSCALE_FACTOR", default))
    except ValueError:
        factor = 2 if ultra else 0
    return max(0, min(factor, 4))


def _lanczos_ultra(img: Image.Image, scale: int) -> Image.Image:
    w, h = img.size
    up = img.resize((w * scale, h * scale), Image.LANCZOS)
    up = ImageEnhance.Contrast(up).enhance(1.04)
    up = ImageEnhance.Sharpness(up).enhance(1.18)
    up = up.filter(ImageFilter.UnsharpMask(radius=1.6, percent=110, threshold=2))
    return up


def _realesrgan_upscale(img: Image.Image, scale: int) -> Image.Image:
    global _upsampler
    if not os.path.exists(REALESRGAN_X2_PATH):
        raise FileNotFoundError(f"Missing {REALESRGAN_X2_PATH}")

    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    if _upsampler is None:
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_block=23,
            num_grow_ch=32,
            scale=2,
        )
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        _upsampler = RealESRGANer(
            scale=2,
            model_path=REALESRGAN_X2_PATH,
            model=model,
            tile=384,
            tile_pad=12,
            pre_pad=0,
            half=device.type == "cuda",
            device=device,
        )

    arr = np.array(img.convert("RGB"))
    output, _ = _upsampler.enhance(arr, outscale=scale)
    return Image.fromarray(output)


def upscale_result(img: Image.Image, scale: int | None = None) -> Image.Image:
    factor = scale if scale is not None else get_upscale_factor()
    if factor <= 1:
        return img

    if os.environ.get("VTO_UPSCALE_ENGINE", "auto").lower() == "lanczos":
        return _lanczos_ultra(img, factor)

    try:
        # Real-ESRGAN is 2x native; chain for 4x
        if factor == 2:
            return _realesrgan_upscale(img, 2)
        out = img
        for _ in range(factor // 2):
            out = _realesrgan_upscale(out, 2)
        if factor % 2 == 1:
            w, h = out.size
            out = out.resize((int(w * 1.5), int(h * 1.5)), Image.LANCZOS)
        return out
    except Exception as exc:
        print(f"Real-ESRGAN upscale fallback ({exc})", flush=True)
        return _lanczos_ultra(img, factor)


def download_realesrgan_weights(weights_dir: str) -> None:
    import urllib.request

    os.makedirs(weights_dir, exist_ok=True)
    dest = os.path.join(weights_dir, "RealESRGAN_x2plus.pth")
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        return
    url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
    print(f"Downloading Real-ESRGAN weights (~64MB)...", flush=True)
    urllib.request.urlretrieve(url, dest)
    print("Real-ESRGAN weights ready", flush=True)
