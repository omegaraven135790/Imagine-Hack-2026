"""
Waste & Optimization router — F7

GET /api/waste          — ranked waste events (highest cost first)
GET /api/waste/summary  — totals and per-category breakdown
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session

from database import get_session
from services.waste_engine import compute
from tenancy import get_store_id

router = APIRouter(prefix="/waste", tags=["waste"])


@router.get("")
def waste_list(
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> list[dict]:
    return compute(session, store_id)


@router.get("/summary")
def waste_summary(
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    events     = compute(session, store_id)
    categories: dict[str, dict] = {}
    total_cost = 0.0
    total_co2e = 0.0

    for ev in events:
        cat = ev["category"]
        if cat not in categories:
            categories[cat] = {"count": 0, "cost_myr": 0.0}
        categories[cat]["count"]   += 1
        categories[cat]["cost_myr"] = round(categories[cat]["cost_myr"] + ev["cost_myr"], 2)
        total_cost += ev["cost_myr"]
        if ev.get("co2e_kg"):
            total_co2e += ev["co2e_kg"]

    return {
        "total_cost_myr": round(total_cost, 2),
        "total_co2e_kg":  round(total_co2e, 2),
        "events_count":   len(events),
        "categories":     categories,
    }
