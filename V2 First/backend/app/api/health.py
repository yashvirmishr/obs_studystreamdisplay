"""Health and status endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import HealthResponse

router = APIRouter()


@router.get("/api/v1/health", response_model=HealthResponse)
def health() -> dict:
    """Basic liveness endpoint used by the desktop shell and dashboard."""
    return {
        "status": "ok",
        "service": "studystream2-backend",
        "api_version": "v1",
    }
