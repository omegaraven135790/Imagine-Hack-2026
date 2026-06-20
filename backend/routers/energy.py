"""
Energy & Water router — F2

GET /api/energy/summary?days=7
GET /api/energy/trend?resource=electricity&days=14
GET /api/energy/zones?resource=electricity&days=7
"""

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from services.anomaly_detection import detect
from services.tariff_service import co2e_factor, elec_rate, water_rate
from tenancy import get_store_id

router = APIRouter(prefix="/energy", tags=["energy"])


class MeterReadingIn(BaseModel):
    resource: Literal["electricity", "water"]
    zone: str
    value: float
    unit: Optional[str] = None  # defaults to kWh/m3 per resource
    ts: Optional[datetime] = None


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/summary")
def energy_summary(
    days: int = Query(7, ge=1, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> dict:
    now      = datetime.now(timezone.utc)
    cur_from = now - timedelta(days=days)
    prv_from = now - timedelta(days=days * 2)

    e_rate = elec_rate(session)
    w_rate = water_rate(session)
    co2    = co2e_factor(session)

    sql = text("""
        select
            resource,
            sum(case when ts >= :cur_from then value else 0 end)                    as cur_val,
            sum(case when ts >= :prv_from and ts < :cur_from then value else 0 end) as prv_val
        from meter_readings
        where store_id = :store_id
          and ts >= :prv_from
        group by resource
    """)
    rows = session.execute(sql, {"store_id": store_id, "cur_from": cur_from, "prv_from": prv_from}).all()

    result: dict = {}
    for resource, cur_val, prv_val in rows:
        cur_val = float(cur_val or 0)
        prv_val = float(prv_val or 0)
        delta_pct = round(((cur_val - prv_val) / prv_val * 100) if prv_val else 0, 1)

        if resource == "electricity":
            result["electricity"] = {
                "kwh":       round(cur_val, 2),
                "cost_myr":  round(cur_val * e_rate, 2),
                "co2e_kg":   round(cur_val * co2, 2),
                "delta_pct": delta_pct,
                "unit":      "kWh",
            }
        else:
            result["water"] = {
                "m3":        round(cur_val, 3),
                "cost_myr":  round(cur_val * w_rate, 2),
                "delta_pct": delta_pct,
                "unit":      "m³",
            }

    result.setdefault("electricity", {"kwh": 0, "cost_myr": 0, "co2e_kg": 0, "delta_pct": 0, "unit": "kWh"})
    result.setdefault("water",       {"m3": 0, "cost_myr": 0, "delta_pct": 0, "unit": "m³"})
    return result


@router.get("/trend")
def energy_trend(
    resource: Literal["electricity", "water"] = Query("electricity"),
    days: int = Query(14, ge=1, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> list[dict]:
    since  = _since(days)
    e_rate = elec_rate(session)
    w_rate = water_rate(session)
    co2    = co2e_factor(session)

    sql = text("""
        select
            date_trunc('day', ts at time zone 'Asia/Kuala_Lumpur') as day,
            sum(value) as total
        from meter_readings
        where store_id = :store_id
          and resource  = :resource
          and ts       >= :since
        group by 1
        order by 1
    """)
    rows = session.execute(sql, {"store_id": store_id, "resource": resource, "since": since}).all()

    rate = e_rate if resource == "electricity" else w_rate
    unit = "kWh" if resource == "electricity" else "m³"

    out = []
    for day, total in rows:
        total = float(total or 0)
        entry: dict = {
            "date":     day.date().isoformat() if hasattr(day, "date") else str(day)[:10],
            "value":    round(total, 3),
            "unit":     unit,
            "cost_myr": round(total * rate, 2),
        }
        if resource == "electricity":
            entry["co2e_kg"] = round(total * co2, 2)
        out.append(entry)
    return out


@router.get("/zones")
def energy_zones(
    resource: Literal["electricity", "water"] = Query("electricity"),
    days: int = Query(7, ge=1, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> list[dict]:
    since  = _since(days)
    e_rate = elec_rate(session)
    w_rate = water_rate(session)
    co2    = co2e_factor(session)

    sql = text("""
        select zone, sum(value) as total
        from meter_readings
        where store_id = :store_id
          and resource  = :resource
          and ts       >= :since
        group by zone
        order by total desc
    """)
    rows = session.execute(sql, {"store_id": store_id, "resource": resource, "since": since}).all()

    rate        = e_rate if resource == "electricity" else w_rate
    grand_total = sum(float(r[1] or 0) for r in rows) or 1.0

    out = []
    for zone, total in rows:
        total = float(total or 0)
        entry: dict = {
            "zone":     zone,
            "value":    round(total, 3),
            "cost_myr": round(total * rate, 2),
            "pct":      round(total / grand_total * 100, 1),
        }
        if resource == "electricity":
            entry["co2e_kg"] = round(total * co2, 2)
        out.append(entry)
    return out


@router.post("/ingest")
def ingest_reading(
    body:     MeterReadingIn,
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    """Ingest one meter reading and run anomaly detection synchronously."""
    ts   = body.ts or datetime.now(timezone.utc)
    unit = body.unit or ("kWh" if body.resource == "electricity" else "m3")

    # Detect BEFORE inserting so the baseline window is clean
    anomaly = detect(session, store_id, body.resource, body.zone, body.value, ts)

    session.execute(
        text("""
            INSERT INTO meter_readings (store_id, resource, zone, value, unit, ts)
            VALUES (:s, :resource, :zone, :value, :unit, :ts)
        """),
        {"s": store_id, "resource": body.resource, "zone": body.zone,
         "value": body.value, "unit": unit, "ts": ts},
    )
    session.commit()

    return {"ingested": True, "resource": body.resource, "zone": body.zone,
            "value": body.value, "ts": ts.isoformat(), "anomaly": anomaly}
