"""
Tariff service — reads current electricity + water tariffs from DB,
falls back to config constants if no DB row exists.

Live fetch (TNB AFA + Air Selangor) is scheduled monthly via APScheduler (Phase 0.6 extension).
For the demo the seeded fallback rows are sufficient.
"""

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from config import settings
from models import Tariff


def get_current_tariff(session: Session, resource: str, region: str = "peninsular") -> dict:
    """Return the latest effective tariff row for resource/region, or config fallback."""
    row = session.exec(
        select(Tariff)
        .where(Tariff.resource == resource, Tariff.region == region)
        .order_by(Tariff.effective_date.desc())  # type: ignore[attr-defined]
    ).first()

    if row:
        return {
            "resource": row.resource,
            "region": row.region,
            "effective_date": row.effective_date.isoformat(),
            "components": json.loads(row.components) if isinstance(row.components, str) else row.components,
            "afa_sen_per_kwh": row.afa_sen_per_kwh,
            "co2e_factor": row.co2e_factor,
            "source_url": row.source_url,
            "fetched_at": row.fetched_at.isoformat(),
            "is_fallback": row.is_fallback,
        }

    # Hard config fallback
    if resource == "electricity":
        return {
            "resource": "electricity",
            "region": region,
            "effective_date": "2025-09-01",
            "components": {
                "energy_sen_per_kwh": 37.03,
                "capacity_sen_per_kwh": 4.55,
                "network_sen_per_kwh": 12.85,
            },
            "afa_sen_per_kwh": 0.0,
            "co2e_factor": settings.co2e_kg_per_kwh,
            "source_url": None,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "is_fallback": True,
        }

    return {
        "resource": "water",
        "region": region,
        "effective_date": "2025-09-01",
        "components": {"tier1_rm_per_m3": settings.water_tariff_myr_per_m3, "min_charge_myr": 36.00},
        "afa_sen_per_kwh": 0.0,
        "co2e_factor": 0.0,
        "source_url": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "is_fallback": True,
    }


def elec_rate(session: Session) -> float:
    """Effective RM/kWh including AFA."""
    t = get_current_tariff(session, "electricity")
    comp = t["components"]
    total_sen = (
        comp.get("energy_sen_per_kwh", 37.03)
        + comp.get("capacity_sen_per_kwh", 4.55)
        + comp.get("network_sen_per_kwh", 12.85)
        + t.get("afa_sen_per_kwh", 0.0)
    )
    return round(total_sen / 100, 4)


def water_rate(session: Session) -> float:
    """RM/m³."""
    t = get_current_tariff(session, "water")
    return t["components"].get("tier1_rm_per_m3", settings.water_tariff_myr_per_m3)


def co2e_factor(session: Session) -> float:
    t = get_current_tariff(session, "electricity")
    return t.get("co2e_factor", settings.co2e_kg_per_kwh)
