"""Blend original photo regions back onto VTO output — hands, face, background, lower body."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter


def _lum(r: float, g: float, b: float) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def _is_skin(r: float, g: float, b: float) -> bool:
    y = _lum(r, g, b)
    if y < 35 or y > 245:
        return False
    if r > 95 and g > 40 and b > 20 and r > g and r > b and r - g > 6:
        return True
    cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b
    cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b
    return 133 <= cr <= 178 and 78 <= cb <= 128 and y > 45


def _background_mask(arr: np.ndarray) -> np.ndarray:
    """Pixels similar to image corners = background to preserve."""
    h, w, _ = arr.shape
    corners = [
        arr[2, 2],
        arr[2, w - 3],
        arr[h - 3, 2],
        arr[h - 3, w - 3],
    ]
    ref = np.mean(corners, axis=0)
    diff = np.sqrt(np.sum((arr - ref) ** 2, axis=2))
    return np.clip((diff - 28) / 42, 0, 1)


def _ellipse_mask(h: int, w: int, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    nx = (xs - cx * w) / (rx * w + 1e-6)
    ny = (ys - cy * h) / (ry * h + 1e-6)
    inside = nx * nx + ny * ny <= 1
    return inside.astype(np.float32)


def _category_masks(h: int, w: int, category: str) -> dict[str, np.ndarray]:
    masks: dict[str, np.ndarray] = {}

    if category in ("tops", "one-pieces", "one_pieces"):
        lower = np.zeros((h, w), dtype=np.float32)
        lower[int(h * 0.48) :, :] = 1.0
        masks["lower_body"] = lower

        waist = np.zeros((h, w), dtype=np.float32)
        y0, y1 = int(h * 0.38), int(h * 0.54)
        waist[y0:y1, :] = 1.0
        masks["waist_band"] = waist

    if category in ("bottoms",):
        upper = np.zeros((h, w), dtype=np.float32)
        upper[: int(h * 0.44), :] = 1.0
        masks["upper_body"] = upper

    left_arm = np.zeros((h, w), dtype=np.float32)
    right_arm = np.zeros((h, w), dtype=np.float32)
    y0, y1 = int(h * 0.22), int(h * 0.78)
    left_arm[y0:y1, : int(w * 0.34)] = 1.0
    right_arm[y0:y1, int(w * 0.66) :] = 1.0
    masks["left_arm"] = left_arm
    masks["right_arm"] = right_arm

    masks["face"] = _ellipse_mask(h, w, 0.5, 0.12, 0.22, 0.11)
    return masks


def _skin_mask_array(arr: np.ndarray) -> np.ndarray:
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    skin = (
        (y >= 35)
        & (y <= 245)
        & (r > 95)
        & (g > 40)
        & (b > 20)
        & (r > g)
        & (r > b)
        & (r - g > 6)
    )
    return skin.astype(np.float32)


def _skin_in_regions(arr: np.ndarray, region: np.ndarray) -> np.ndarray:
    return _skin_mask_array(arr) * (region > 0)


def _feather(mask: np.ndarray, radius: int = 5) -> np.ndarray:
    img = Image.fromarray((mask * 255).astype(np.uint8))
    blurred = img.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.array(blurred, dtype=np.float32) / 255.0


def _align_sizes(original: Image.Image, generated: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    orig = original.convert("RGB")
    gen = generated.convert("RGB")
    if gen.size != orig.size:
        gen = gen.resize(orig.size, Image.LANCZOS)
    return np.array(orig, dtype=np.float32), np.array(gen, dtype=np.float32)


def preserve_identity(
    original: Image.Image,
    generated: Image.Image,
    category: str,
) -> Image.Image:
    """
    Composite original pixels where the diffusion model should not change anything:
    background, face, hands/arms, pants (when swapping tops), waist transition.
    """
    orig, gen = _align_sizes(original, generated)
    h, w, _ = orig.shape
    cat = category.replace("_", "-")

    preserve = np.zeros((h, w), dtype=np.float32)
    preserve = np.maximum(preserve, _background_mask(orig) * 0.94)
    preserve = np.maximum(preserve, _category_masks(h, w, cat).get("face", 0) * 0.72)

    regions = _category_masks(h, w, cat)
    if "lower_body" in regions:
        preserve = np.maximum(preserve, regions["lower_body"] * 0.9)
    if "upper_body" in regions:
        preserve = np.maximum(preserve, regions["upper_body"] * 0.88)
    if "waist_band" in regions:
        preserve = np.maximum(preserve, regions["waist_band"] * 0.82)

    left_skin = _skin_in_regions(orig, regions.get("left_arm", np.zeros((h, w))))
    right_skin = _skin_in_regions(orig, regions.get("right_arm", np.zeros((h, w))))
    preserve = np.maximum(preserve, left_skin * 0.94)
    preserve = np.maximum(preserve, right_skin * 0.94)

    # Fix waist blob: where generated differs strongly from original in waist band, prefer original
    if "waist_band" in regions:
        waist = regions["waist_band"] > 0
        diff = np.sqrt(np.sum((orig - gen) ** 2, axis=2))
        artifact = waist & (diff > 55)
        preserve[artifact] = np.maximum(preserve[artifact], 0.92)

    preserve = _feather(np.clip(preserve, 0, 1), radius=4)

    out = gen * (1 - preserve[..., None]) + orig * preserve[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
