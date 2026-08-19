"""Light post-processing to improve try-on output clarity and fix common artifacts."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def _repair_waist_seam(img: Image.Image) -> Image.Image:
    """Blend silvery/metallic horizontal bands at the upper–lower garment junction."""
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    y0, y1 = int(h * 0.43), int(h * 0.57)
    if y1 <= y0 + 2:
        return img

    for y in range(y0, y1):
        for x in range(w):
            r, g, b = arr[y, x]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            chroma = max(r, g, b) - min(r, g, b)
            # Silver seam artifact: bright, low-chroma band at waist
            if lum > 130 and chroma < 45:
                above_y = max(y0 - 8, 0)
                below_y = min(y1 + 8, h - 1)
                t = (y - y0) / max(y1 - y0, 1)
                blend = arr[above_y, x] * (1 - t) + arr[below_y, x] * t
                arr[y, x] = arr[y, x] * 0.25 + blend * 0.75

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def _smooth_skin_edges(img: Image.Image) -> Image.Image:
    """Very light pass to reduce harsh cloth–skin boundaries."""
    return img.filter(ImageFilter.SMOOTH_MORE)


def enhance_tryon_result(img: Image.Image) -> Image.Image:
    """Sharpen, balance colors, and repair common VTO seam artifacts."""
    out = img.convert("RGB")
    out = _repair_waist_seam(out)
    out = ImageEnhance.Contrast(out).enhance(1.08)
    out = ImageEnhance.Sharpness(out).enhance(1.15)
    out = ImageEnhance.Color(out).enhance(1.05)
    out = ImageEnhance.Brightness(out).enhance(1.01)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=4))
    out = _smooth_skin_edges(out)
    return out
