"""FASHN cloud API — Try-On Max / v1.6 when FASHN_API_KEY is set (not runnable on Kaggle GPU)."""

from __future__ import annotations

import base64
import io
import os
import time
from typing import Literal, Optional

import requests
from PIL import Image

FASHN_API_BASE = os.environ.get("FASHN_API_BASE", "https://api.fashn.ai")
POLL_INTERVAL = float(os.environ.get("FASHN_POLL_INTERVAL", "2.0"))
POLL_TIMEOUT = int(os.environ.get("FASHN_POLL_TIMEOUT", "600"))


def _headers() -> dict[str, str]:
    key = os.environ.get("FASHN_API_KEY", "")
    if not key:
        raise RuntimeError("FASHN_API_KEY not set")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _image_to_data_uri(img: Image.Image, fmt: str = "JPEG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=92)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime = "image/jpeg" if fmt.upper() == "JPEG" else "image/png"
    return f"data:{mime};base64,{b64}"


def _resolve_backend() -> tuple[str, dict]:
    mode = os.environ.get("VTO_BACKEND", "auto").lower()
    if mode in ("fashn-v16", "v16", "tryon-v1-6"):
        return "tryon-v1.6", {}
    return "tryon-max", {}


def run_fashn_tryon(
    person: Image.Image,
    garment: Image.Image,
    category: str,
    garment_photo_type: str,
) -> Image.Image:
    """Submit person + garment to FASHN API and return result PIL image."""
    model_name, _ = _resolve_backend()
    model_uri = _image_to_data_uri(person)
    garment_uri = _image_to_data_uri(garment)

    cat_map = {
        "tops": "tops",
        "bottoms": "bottoms",
        "one-pieces": "one-pieces",
        "one_pieces": "one-pieces",
    }
    vto_cat = category.replace("_", "-")

    if model_name == "tryon-v1.6":
        inputs: dict = {
            "model_image": model_uri,
            "garment_image": garment_uri,
            "category": cat_map.get(vto_cat, "auto"),
            "garment_photo_type": "auto" if garment_photo_type == "flat-lay" else garment_photo_type,
            "segmentation_free": True,
            "mode": os.environ.get("FASHN_V16_MODE", "quality"),
            "output_format": "png",
        }
    else:
        resolution = os.environ.get("FASHN_RESOLUTION", "1k")
        generation_mode = os.environ.get("FASHN_GENERATION_MODE", "balanced")
        inputs = {
            "model_image": model_uri,
            "product_image": garment_uri,
            "resolution": resolution,
            "generation_mode": generation_mode,
            "output_format": "png",
        }
        prompt = os.environ.get("FASHN_PROMPT", "")
        if not prompt:
            if vto_cat in ("tops", "one-pieces"):
                prompt = "keep original pose, background, and pants unchanged; swap upper garment only"
            elif vto_cat == "bottoms":
                prompt = "keep original pose, background, and upper clothing unchanged; swap pants only"
        if prompt:
            inputs["prompt"] = prompt

    resp = requests.post(
        f"{FASHN_API_BASE}/v1/run",
        headers=_headers(),
        json={"model_name": model_name, "inputs": inputs},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("error"):
        raise RuntimeError(str(data["error"]))
    prediction_id = data["id"]

    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL)
        status_resp = requests.get(
            f"{FASHN_API_BASE}/v1/status/{prediction_id}",
            headers=_headers(),
            timeout=30,
        )
        status_resp.raise_for_status()
        status = status_resp.json()
        state = status.get("status")
        if state == "completed":
            output = status.get("output") or []
            if not output:
                raise RuntimeError("FASHN returned empty output")
            url = output[0]
            if url.startswith("data:"):
                _, b64 = url.split(",", 1)
                raw = base64.b64decode(b64)
                return Image.open(io.BytesIO(raw)).convert("RGB")
            img_resp = requests.get(url, timeout=120)
            img_resp.raise_for_status()
            return Image.open(io.BytesIO(img_resp.content)).convert("RGB")
        if state == "failed":
            err = status.get("error") or {}
            raise RuntimeError(err.get("message") or str(err))

    raise RuntimeError("FASHN try-on timed out")


def fashn_available() -> bool:
    return bool(os.environ.get("FASHN_API_KEY", ""))
