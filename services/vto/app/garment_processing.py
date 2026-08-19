"""Garment upload processing: background removal, color and category detection."""

from __future__ import annotations

import base64
import io
from collections import Counter
from typing import Optional

import numpy as np
from PIL import Image

try:
    from rembg import remove as rembg_remove

    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False


COLOR_NAMES = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "red": (220, 50, 50),
    "blue": (50, 80, 200),
    "navy": (20, 40, 100),
    "green": (50, 150, 80),
    "yellow": (230, 200, 50),
    "orange": (230, 120, 40),
    "pink": (230, 120, 160),
    "purple": (120, 60, 160),
    "brown": (120, 80, 50),
    "gray": (128, 128, 128),
    "beige": (210, 190, 160),
}


def _encode_image(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _color_distance(c1: tuple, c2: tuple) -> float:
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


def detect_dominant_color(img: Image.Image) -> str:
    arr = np.array(img.convert("RGB"))
    # Sample center region to avoid edge artifacts
    h, w = arr.shape[:2]
    margin = int(min(h, w) * 0.15)
    center = arr[margin : h - margin, margin : w - margin]
    pixels = center.reshape(-1, 3)

    # Quantize and find most common
    quantized = (pixels // 32) * 32
    counts = Counter(map(tuple, quantized))
    dominant = counts.most_common(1)[0][0]

    best_name = "unknown"
    best_dist = float("inf")
    for name, ref in COLOR_NAMES.items():
        d = _color_distance(dominant, ref)
        if d < best_dist:
            best_dist = d
            best_name = name
    return best_name


def suggest_category(img: Image.Image) -> str:
    """Heuristic category suggestion based on aspect ratio."""
    w, h = img.size
    ratio = w / h if h else 1

    if ratio > 1.3:
        return "tops"  # Wide — likely laid flat top
    if ratio < 0.7:
        return "bottoms"  # Tall narrow — pants/skirt
    if 0.7 <= ratio <= 1.1:
        return "one-pieces"  # Square-ish — dress
    return "tops"


def process_garment_upload(img: Image.Image, category_hint: Optional[str] = None) -> dict:
    background_removed = False
    processed = img.copy()

    if HAS_REMBG:
        try:
            rgba = rembg_remove(processed)
            processed = rgba.convert("RGBA")
            background_removed = True
        except Exception:
            processed = img.convert("RGB")
    else:
        processed = img.convert("RGB")

    # Flatten onto white background for VTO
    if processed.mode == "RGBA":
        bg = Image.new("RGB", processed.size, (255, 255, 255))
        bg.paste(processed, mask=processed.split()[3])
        vto_ready = bg
    else:
        vto_ready = processed.convert("RGB")

    suggested = category_hint or suggest_category(vto_ready)
    if suggested not in ("tops", "bottoms", "one-pieces"):
        suggested = "tops"

    return {
        "vto_ready_image": _encode_image(vto_ready),
        "detected_color": detect_dominant_color(vto_ready),
        "suggested_category": suggested,
        "background_removed": background_removed,
    }
