"""
GET /api/tariffs/current  — active rates for electricity + water
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from auth import verify_token
from database import get_session
from services.tariff_service import get_current_tariff

router = APIRouter(prefix="/tariffs", tags=["tariffs"])


@router.get("/current")
def current_tariffs(
    session: Session = Depends(get_session),
    _: dict = Depends(verify_token),
) -> dict:
    return {
        "electricity": get_current_tariff(session, "electricity"),
        "water": get_current_tariff(session, "water"),
    }
