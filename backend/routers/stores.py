"""
Stores router — tenancy discovery endpoints.

GET /api/stores          → list all stores (for the store switcher UI)
GET /api/stores/{id}     → single store detail
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlmodel import Session, select

from auth import verify_token
from database import get_session
from models import Store

router = APIRouter(tags=["stores"])


@router.get("/stores")
def list_stores(
    session: Session = Depends(get_session),
    payload: dict = Depends(verify_token),
) -> list[dict]:
    user_id = payload.get("sub", "")
    rows = session.execute(
        text("""
            SELECT s.id, s.name, s.location, s.open_hour, s.close_hour, s.timezone
            FROM stores s
            JOIN memberships m ON m.org_id = s.org_id
            WHERE m.user_id = :uid
            ORDER BY s.name
        """),
        {"uid": user_id},
    ).all()
    return [
        {
            "id":         r[0],
            "name":       r[1],
            "location":   r[2],
            "open_hour":  r[3],
            "close_hour": r[4],
            "timezone":   r[5],
        }
        for r in rows
    ]


@router.get("/stores/{store_id}")
def get_store(
    store_id: str,
    session: Session = Depends(get_session),
    _payload: dict = Depends(verify_token),
) -> dict:
    store = session.exec(select(Store).where(Store.id == store_id)).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    return {
        "id": store.id,
        "org_id": store.org_id,
        "name": store.name,
        "location": store.location,
        "floor_area_sqm": store.floor_area_sqm,
        "max_occupancy": store.max_occupancy,
        "open_hour": store.open_hour,
        "close_hour": store.close_hour,
        "timezone": store.timezone,
        "created_at": store.created_at.isoformat(),
    }
