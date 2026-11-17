"""Study session endpoints. Backend is authoritative (ARCHITECTURE invariant 8)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.study import service

router = APIRouter(prefix="/api/v1/study")


class SessionRequest(BaseModel):
    subject: str | None = Field(default=None, max_length=120)
    task: str | None = Field(default=None, max_length=200)


@router.get("/state")
def get_state() -> dict:
    from app.database import SessionLocal

    with SessionLocal() as db:
        return service.state_payload(db)


@router.post("/start", status_code=201)
def start(body: SessionRequest | None = None) -> dict:
    try:
        return service.start_session(
            subject=body.subject if body else None,
            task=body.task if body else None,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/pause")
def pause() -> dict:
    try:
        return service.pause_session()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/resume")
def resume() -> dict:
    try:
        return service.resume_session()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/stop")
def stop() -> dict:
    try:
        return service.stop_session()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/history")
def get_history(limit: int = 20) -> list[dict]:
    return service.history(limit=limit)
