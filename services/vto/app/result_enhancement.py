"""Light post-processing to improve try-on output clarity."""

from __future__ import annotations

from PIL import Image, ImageEnhance, ImageFilter


def enhance_tryon_result(img: Image.Image) -> Image.Image:
    """Sharpen and balance colors without heavy upscaling."""
    out = img.convert("RGB")
    out = ImageEnhance.Contrast(out).enhance(1.1)
    out = ImageEnhance.Sharpness(out).enhance(1.2)
    out = ImageEnhance.Color(out).enhance(1.06)
    out = ImageEnhance.Brightness(out).enhance(1.02)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=3))
