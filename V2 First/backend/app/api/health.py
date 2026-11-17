"""Health and status endpoints."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/v1/health")
def health() -> dict:
    """Basic liveness endpoint used by the desktop shell and dashboard."""
    return {
        "status": "ok",
        "service": "studystream2-backend",
        "api_version": "v1",
    }
