"""Async job tracking for long-running try-on inference."""

from __future__ import annotations

import threading
import time
from typing import Any, Optional

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def create_job(job_id: str) -> None:
    with _lock:
        _jobs[job_id] = {
            "status": "processing",
            "progress": "queued",
            "result_url": None,
            "processing_time_ms": 0,
            "error": None,
            "created_at": time.time(),
        }


def update_job(job_id: str, **fields: Any) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def complete_job(job_id: str, result_url: str, processing_time_ms: int) -> None:
    update_job(
        job_id,
        status="completed",
        progress="done",
        result_url=result_url,
        processing_time_ms=processing_time_ms,
    )


def fail_job(job_id: str, error: str, processing_time_ms: int = 0) -> None:
    update_job(
        job_id,
        status="failed",
        progress="error",
        error=error,
        processing_time_ms=processing_time_ms,
    )


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None
