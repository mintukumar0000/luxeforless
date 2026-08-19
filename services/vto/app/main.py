"""LuxeForLess VTO inference service — wraps FASHN VTON v1.5."""

import asyncio
import base64
import io
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, Field

from .jobs import complete_job, create_job, fail_job, get_job, update_job

WEIGHTS_DIR = os.environ.get("WEIGHTS_DIR", "./weights")
RESULTS_DIR = os.environ.get("RESULTS_DIR", "./results")
MOCK_VTO = os.environ.get("MOCK_VTO", "false").lower() == "true"
VTO_PREPROCESS_PERSON = os.environ.get("VTO_PREPROCESS_PERSON", "false").lower() == "true"
VTO_KEEP_ORIGINAL_BACKGROUND = os.environ.get("VTO_KEEP_ORIGINAL_BACKGROUND", "true").lower() == "true"
VTO_ENHANCE_RESULT = os.environ.get("VTO_ENHANCE_RESULT", "true").lower() == "true"
# 24 steps @ up to 1280px — preserve input scene (no studio rembg)
VTO_NUM_TIMESTEPS = int(os.environ.get("VTO_NUM_TIMESTEPS", "24"))
VTO_MAX_IMAGE_SIZE = int(os.environ.get("VTO_MAX_IMAGE_SIZE", "1280"))

# NOTE: Do NOT set PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7 — it causes
# "invalid low watermark ratio 1.4" on Apple Silicon. Set in shell before
# start only if needed: export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0

_pipeline = None
_pipeline_lock = threading.Lock()
_executor: ThreadPoolExecutor | None = None


def _get_device() -> str:
    import torch

    forced = os.environ.get("VTO_DEVICE", "").lower()
    if forced in ("cpu", "mps", "cuda"):
        return forced
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1)
    return _executor


def get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    with _pipeline_lock:
        if _pipeline is not None:
            return _pipeline
        if MOCK_VTO:
            return None
        from fashn_vton import TryOnPipeline

        weights_path = os.path.abspath(WEIGHTS_DIR)
        if not os.path.exists(weights_path):
            raise RuntimeError(
                f"Weights not found at {weights_path}. "
                f"Run: python vendor/fashn-vton-1.5/scripts/download_weights.py --weights-dir {weights_path}"
            )
        device = _get_device()
        hp_device = os.environ.get("VTO_HP_DEVICE", "")
        print(
            f"Loading VTO pipeline: device={device}, hp_device={hp_device or 'auto'}, "
            f"timesteps={VTO_NUM_TIMESTEPS}",
            flush=True,
        )
        _pipeline = TryOnPipeline(weights_dir=weights_path, device=device)
        print("VTO pipeline loaded successfully", flush=True)
    return _pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    if os.environ.get("VTO_PRELOAD_ON_START", "").lower() in ("1", "true", "yes") and not MOCK_VTO:
        print("Pre-loading VTO pipeline in server process...", flush=True)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_get_executor(), get_pipeline)
        print("VTO pipeline ready for try-on requests", flush=True)
    yield


app = FastAPI(
    title="LuxeForLess VTO Service",
    description="Virtual try-on inference API (powered by open-source VTON model)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TryOnRequest(BaseModel):
    person_image: str = Field(..., description="Base64-encoded person image")
    garment_image: str = Field(..., description="Base64-encoded garment image")
    category: Literal["tops", "bottoms", "one-pieces"]
    garment_photo_type: Literal["model", "flat-lay"] = "flat-lay"
    preserve_background: bool = Field(
        True,
        description="Keep original photo background/pose — only swap garment region",
    )


class TryOnResponse(BaseModel):
    job_id: str
    status: Literal["processing", "completed", "failed"]
    result_url: Optional[str] = None
    processing_time_ms: int = 0
    model: str = "fashn-vton-1.5"
    error: Optional[str] = None
    progress: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["processing", "completed", "failed"]
    result_url: Optional[str] = None
    processing_time_ms: int = 0
    error: Optional[str] = None
    progress: Optional[str] = None


class BodyValidationResponse(BaseModel):
    valid: bool
    issues: list[str]
    estimates: Optional[dict] = None


class GarmentProcessResponse(BaseModel):
    vto_ready_image: str
    detected_color: str
    suggested_category: str
    background_removed: bool


class PersonPreprocessResponse(BaseModel):
    image: str = Field(..., description="Base64-encoded studio-ready PNG")
    background_removed: bool
    studio_background: str


def _decode_image(data: str, *, for_person: bool = False) -> Image.Image:
    if "," in data:
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if for_person and VTO_KEEP_ORIGINAL_BACKGROUND:
        limit = VTO_MAX_IMAGE_SIZE
    else:
        limit = min(int(VTO_MAX_IMAGE_SIZE * 1.25), 1280) if for_person else VTO_MAX_IMAGE_SIZE
    if max(img.size) > limit:
        img = img.copy()
        img.thumbnail((limit, limit), Image.LANCZOS)
    return img


def _resize_if_needed(img: Image.Image, max_size: int) -> Image.Image:
    if max(img.size) <= max_size:
        return img
    out = img.copy()
    out.thumbnail((max_size, max_size), Image.LANCZOS)
    return out


def _should_preprocess_person(img: Image.Image, preserve_background: bool) -> bool:
    if preserve_background or VTO_KEEP_ORIGINAL_BACKGROUND or not VTO_PREPROCESS_PERSON:
        return False
    from .person_preprocessing import is_studio_ready

    return not is_studio_ready(img)


def _encode_image_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _run_inference(pipeline, person, garment, category, garment_photo_type):
    import gc
    import torch

    try:
        return pipeline(
            person_image=person,
            garment_image=garment,
            category=category,
            garment_photo_type=garment_photo_type,
            num_timesteps=VTO_NUM_TIMESTEPS,
        )
    finally:
        gc.collect()
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()


@app.get("/health")
async def health():
    import torch

    return {
        "status": "ok",
        "pipeline_loaded": _pipeline is not None or MOCK_VTO,
        "mock_mode": MOCK_VTO,
        "model": "fashn-vton-1.5",
        "device": _get_device() if not MOCK_VTO else "mock",
        "num_timesteps": VTO_NUM_TIMESTEPS,
        "max_image_size": VTO_MAX_IMAGE_SIZE,
        "preprocess_person": VTO_PREPROCESS_PERSON,
        "keep_original_background": VTO_KEEP_ORIGINAL_BACKGROUND,
        "enhance_result": VTO_ENHANCE_RESULT,
    }


def _execute_tryon_job(
    job_id: str,
    person,
    garment,
    category: str,
    garment_photo_type: str,
    preserve_background: bool,
) -> None:
    start = time.time()
    try:
        if MOCK_VTO:
            filename = f"{job_id}.png"
            filepath = os.path.join(RESULTS_DIR, filename)
            person.save(filepath)
            complete_job(job_id, f"/v1/results/{filename}", int((time.time() - start) * 1000))
            return

        print(f"Try-on job {job_id}: preprocessing", flush=True)
        update_job(job_id, progress="preprocessing")
        if _should_preprocess_person(person, preserve_background):
            from .person_preprocessing import preprocess_person_for_vto

            person = preprocess_person_for_vto(person, max_size=VTO_MAX_IMAGE_SIZE)
        else:
            person = _resize_if_needed(person, VTO_MAX_IMAGE_SIZE)
            print(f"Try-on job {job_id}: keeping original scene ({person.size[0]}x{person.size[1]})", flush=True)
        garment = _resize_if_needed(garment, VTO_MAX_IMAGE_SIZE)

        print(f"Try-on job {job_id}: loading_model", flush=True)
        update_job(job_id, progress="loading_model")
        pipeline = get_pipeline()
        print(f"Try-on job {job_id}: generating ({VTO_NUM_TIMESTEPS} steps)", flush=True)
        update_job(job_id, progress="generating")
        result = _run_inference(pipeline, person, garment, category, garment_photo_type)

        filename = f"{job_id}.png"
        filepath = os.path.join(RESULTS_DIR, filename)
        out_img = result.images[0]
        if VTO_ENHANCE_RESULT:
            from .result_enhancement import enhance_tryon_result

            out_img = enhance_tryon_result(out_img, preserve_scene=preserve_background or VTO_KEEP_ORIGINAL_BACKGROUND)
        out_img.save(filepath, format="PNG", compress_level=1)
        complete_job(job_id, f"/v1/results/{filename}", int((time.time() - start) * 1000))
    except Exception as e:
        import traceback

        print(f"Try-on job {job_id} failed: {e}", flush=True)
        traceback.print_exc()
        fail_job(job_id, str(e), int((time.time() - start) * 1000))


@app.post("/v1/tryon", response_model=TryOnResponse)
async def tryon(req: TryOnRequest):
    job_id = str(uuid.uuid4())
    create_job(job_id)

    try:
        person = _decode_image(req.person_image, for_person=True)
        garment = _decode_image(req.garment_image)

        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            _get_executor(),
            _execute_tryon_job,
            job_id,
            person,
            garment,
            req.category,
            req.garment_photo_type,
            req.preserve_background,
        )

        return TryOnResponse(
            job_id=job_id,
            status="processing",
            progress="queued",
            processing_time_ms=0,
        )
    except Exception as e:
        fail_job(job_id, str(e))
        return TryOnResponse(
            job_id=job_id,
            status="failed",
            error=str(e),
            processing_time_ms=0,
        )


@app.get("/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        result_url=job.get("result_url"),
        processing_time_ms=job.get("processing_time_ms", 0),
        error=job.get("error"),
        progress=job.get("progress"),
    )


@app.get("/v1/results/{filename}")
async def get_result(filename: str):
    filepath = os.path.join(RESULTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Result not found")
    return FileResponse(filepath, media_type="image/png")


@app.post("/v1/validate-body", response_model=BodyValidationResponse)
async def validate_body(image: UploadFile = File(...)):
    from .body_validation import validate_body_capture

    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    result = validate_body_capture(img)
    return BodyValidationResponse(**result)


@app.post("/v1/preprocess-person", response_model=PersonPreprocessResponse)
async def preprocess_person(
    image: UploadFile = File(...),
    keep_background: bool = Form(True),
):
    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    if keep_background or VTO_KEEP_ORIGINAL_BACKGROUND:
        img = _resize_if_needed(img, VTO_MAX_IMAGE_SIZE)
        return PersonPreprocessResponse(
            image=_encode_image_b64(img),
            background_removed=False,
            studio_background="original",
        )

    from .person_preprocessing import preprocess_person_for_vto

    studio = preprocess_person_for_vto(img, max_size=VTO_MAX_IMAGE_SIZE)
    return PersonPreprocessResponse(
        image=_encode_image_b64(studio),
        background_removed=True,
        studio_background="studio",
    )


@app.post("/v1/process-garment", response_model=GarmentProcessResponse)
async def process_garment(
    image: UploadFile = File(...),
    category: Optional[str] = Form(None),
):
    from .garment_processing import process_garment_upload

    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    result = process_garment_upload(img, category_hint=category)
    return GarmentProcessResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
