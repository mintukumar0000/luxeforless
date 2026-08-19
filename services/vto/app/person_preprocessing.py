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


def _subject_bbox(rgba: Image.Image, alpha_threshold: int = 32) -> Tuple[int, int, int, int]:
    alpha = np.array(rgba.split()[3])
    ys, xs = np.where(alpha > alpha_threshold)
    if len(xs) == 0:
        return 0, 0, rgba.width, rgba.height
    pad = int(max(rgba.width, rgba.height) * 0.03)
    left = max(0, int(xs.min()) - pad)
    top = max(0, int(ys.min()) - pad)
    right = min(rgba.width, int(xs.max()) + pad)
    bottom = min(rgba.height, int(ys.max()) + pad)
    return left, top, right, bottom


def _refine_cutout_alpha(rgba: Image.Image) -> Image.Image:
    """Remove rembg halos and semi-transparent fringe pixels."""
    arr = np.array(rgba.convert("RGBA"))
    alpha = arr[:, :, 3].astype(np.float32)
    alpha = np.where(alpha < 36, 0, alpha)
    alpha = np.clip((alpha - 36) * (255.0 / 219.0), 0, 255)
    arr[:, :, 3] = alpha.astype(np.uint8)

    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3:4].astype(np.float32) / 255.0
    # Un-premultiply faint edge pixels toward white to kill color spill
    spill = a < 0.85
    for c in range(3):
        channel = rgb[:, :, c]
        channel = np.where(spill, (channel - (1 - a[:, :, 0]) * 255) / np.maximum(a[:, :, 0], 0.05), channel)
        rgb[:, :, c] = np.clip(channel, 0, 255)
    arr[:, :, :3] = rgb.astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def _remove_background(rgb: Image.Image) -> Image.Image:
    if not HAS_REMBG:
        return rgb.convert("RGBA")
    try:
        cutout = rembg_remove(
            rgb,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=12,
            alpha_matting_erode_size=12,
        )
        if isinstance(cutout, bytes):
            rgba = Image.open(io.BytesIO(cutout)).convert("RGBA")
        else:
            rgba = cutout.convert("RGBA")
        return _refine_cutout_alpha(rgba)
    except Exception:
        return rgb.convert("RGBA")


def _studio_background(size: Tuple[int, int], style: StudioBackground) -> Image.Image:
    w, h = size
    if style == "white":
        return Image.new("RGB", size, (255, 255, 255))

    bg = Image.new("RGB", size, (255, 255, 255))
    draw = ImageDraw.Draw(bg)
    top = (248, 248, 250)
    bottom = (240, 240, 244)
    for y in range(h):
        t = y / max(h - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)
    return bg


def is_studio_ready(img: Image.Image) -> bool:
    """True when image already has a clean studio/white backdrop (skip re-rembg)."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    samples = [
        (2, 2),
        (w - 3, 2),
        (2, h - 3),
        (w - 3, h - 3),
        (w // 2, 2),
        (w // 2, h - 3),
    ]
    for x, y in samples:
        r, g, b = rgb.getpixel((x, y))
        if r < 228 or g < 228 or b < 228:
            return False
    return True


def preprocess_person_for_vto(
    img: Image.Image,
    *,
    background: StudioBackground = "white",
    aspect_ratio: Tuple[int, int] = (3, 4),
    max_size: int = 1080,
) -> Image.Image:
    """Remove cluttered background and place the subject on a clean studio canvas."""
    rgb = img.convert("RGB")
    rgba = _remove_background(rgb)

    left, top, right, bottom = _subject_bbox(rgba)
    subject = rgba.crop((left, top, right, bottom))

    aw, ah = aspect_ratio
    target_w = min(max_size, max(subject.width, int(subject.height * aw / ah)))
    target_h = int(target_w * ah / aw)
    canvas = _studio_background((target_w, target_h), background)

    scale = min(
        (target_w * 0.88) / max(subject.width, 1),
        (target_h * 0.92) / max(subject.height, 1),
    )
    new_w = max(1, int(subject.width * scale))
    new_h = max(1, int(subject.height * scale))
    subject = subject.resize((new_w, new_h), Image.LANCZOS)

    x = (target_w - new_w) // 2
    y = int((target_h - new_h) * 0.52)
    y = max(int(target_h * 0.02), min(y, target_h - new_h - int(target_h * 0.02)))
    canvas.paste(subject, (x, y), subject)
    return canvas
