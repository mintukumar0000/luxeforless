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
            if lum > 130 and chroma < 45:
                above_y = max(y0 - 8, 0)
                below_y = min(y1 + 8, h - 1)
                t = (y - y0) / max(y1 - y0, 1)
                blend = arr[above_y, x] * (1 - t) + arr[below_y, x] * t
                arr[y, x] = arr[y, x] * 0.25 + blend * 0.75

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def _clean_background_fringe(img: Image.Image) -> Image.Image:
    """Remove rembg / compositing ghosts — pale halos beside arms and body."""
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)

    pure_bg = lum > 248
    fringe = (lum > 198) & (lum <= 248) & (chroma < 38)
    arr[fringe] = 255.0

    # Desaturate low-chroma mid-tones outside the subject core (vertical smear artifacts)
    side_margin = int(arr.shape[1] * 0.08)
    edge_cols = np.zeros(arr.shape[:2], dtype=bool)
    edge_cols[:, :side_margin] = True
    edge_cols[:, -side_margin:] = True
    smear = edge_cols & (lum > 175) & (lum < 245) & (chroma < 55)
    arr[smear] = 255.0

    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def enhance_tryon_result(img: Image.Image) -> Image.Image:
    """Sharpen, balance colors, clean background fringe, repair waist seam."""
    out = img.convert("RGB")
    out = _clean_background_fringe(out)
    out = _repair_waist_seam(out)
    out = ImageEnhance.Contrast(out).enhance(1.06)
    out = ImageEnhance.Sharpness(out).enhance(1.2)
    out = ImageEnhance.Color(out).enhance(1.04)
    out = ImageEnhance.Brightness(out).enhance(1.02)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=85, threshold=3))
    return out
