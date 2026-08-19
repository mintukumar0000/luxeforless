"""Prepare user photos for VTO: background removal + studio backdrop."""

from __future__ import annotations

import io
from typing import Literal, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

try:
    from rembg import remove as rembg_remove

    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False

StudioBackground = Literal["white", "studio"]


def _subject_bbox(rgba: Image.Image, alpha_threshold: int = 24) -> Tuple[int, int, int, int]:
    alpha = np.array(rgba.split()[3])
    ys, xs = np.where(alpha > alpha_threshold)
    if len(xs) == 0:
        return 0, 0, rgba.width, rgba.height
    pad = int(max(rgba.width, rgba.height) * 0.04)
    left = max(0, int(xs.min()) - pad)
    top = max(0, int(ys.min()) - pad)
    right = min(rgba.width, int(xs.max()) + pad)
    bottom = min(rgba.height, int(ys.max()) + pad)
    return left, top, right, bottom


def _studio_background(size: Tuple[int, int], style: StudioBackground) -> Image.Image:
    w, h = size
    bg = Image.new("RGB", size, (255, 255, 255))
    if style == "white":
        return bg

    # Soft gray studio gradient (catalog-style)
    draw = ImageDraw.Draw(bg)
    top = (242, 242, 244)
    bottom = (228, 228, 232)
    for y in range(h):
        t = y / max(h - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)
    return bg.filter(ImageFilter.GaussianBlur(radius=0.6))


def preprocess_person_for_vto(
    img: Image.Image,
    *,
    background: StudioBackground = "studio",
    aspect_ratio: Tuple[int, int] = (3, 4),
    max_size: int = 1024,
) -> Image.Image:
    """Remove cluttered background and place the subject on a clean studio canvas."""
    rgb = img.convert("RGB")

    if HAS_REMBG:
        try:
            cutout = rembg_remove(rgb)
            if isinstance(cutout, bytes):
                rgba = Image.open(io.BytesIO(cutout)).convert("RGBA")
            else:
                rgba = cutout.convert("RGBA")
        except Exception:
            rgba = rgb.convert("RGBA")
    else:
        rgba = rgb.convert("RGBA")

    left, top, right, bottom = _subject_bbox(rgba)
    subject = rgba.crop((left, top, right, bottom))

    aw, ah = aspect_ratio
    target_w = min(max_size, max(subject.width, int(subject.height * aw / ah)))
    target_h = int(target_w * ah / aw)
    canvas = _studio_background((target_w, target_h), background)

    scale = min(
        (target_w * 0.9) / max(subject.width, 1),
        (target_h * 0.94) / max(subject.height, 1),
    )
    new_w = max(1, int(subject.width * scale))
    new_h = max(1, int(subject.height * scale))
    subject = subject.resize((new_w, new_h), Image.LANCZOS)

    x = (target_w - new_w) // 2
    # Center body with slight downward bias — keeps headroom and feet visible for VTO alignment
    y = int((target_h - new_h) * 0.52)
    y = max(int(target_h * 0.02), min(y, target_h - new_h - int(target_h * 0.02)))
    canvas.paste(subject, (x, y), subject)
    return canvas
