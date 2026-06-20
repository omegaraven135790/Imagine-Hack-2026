"""
Forecast router — F5

GET /api/forecast?metric=electricity|water|footfall|sales&horizon=7

Results are cached in the `forecasts` table for CACHE_HOURS hours so charts
respond instantly after the first load.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from services import forecasting
from tenancy import get_store_id

router = APIRouter(prefix="/forecast", tags=["forecast"])

Metric = Literal["electricity", "water", "footfall", "sales"]

CACHE_HOURS = 6
HISTORY_DAYS = 90


# ── cache helpers ──────────────────────────────────────────────────────────────

def _is_fresh(generated_at: datetime) -> bool:
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - generated_at).total_seconds() < CACHE_HOURS * 3600


def _load_cache(session: Session, store_id: str, metric: str) -> dict | None:
    row = session.execute(
        text("""
            SELECT points, model, generated_at
            FROM forecasts
            WHERE store_id = :s AND metric = :m
            ORDER BY generated_at DESC
            LIMIT 1
        """),
        {"s": store_id, "m": metric},
    ).first()
    if not row:
        return None
    generated_at = row[2]
    if not _is_fresh(generated_at):
        return None
    raw = row[0]
    pts = raw if isinstance(raw, list) else json.loads(raw)
    return {
        "model":        row[1],
        "points":       pts,
        "generated_at": generated_at.isoformat() if hasattr(generated_at, "isoformat") else str(generated_at),
        "cached":       True,
    }


def _save_cache(
    session: Session,
    store_id: str,
    metric: str,
    result: dict,
    horizon: int,
) -> None:
    now = datetime.now(timezone.utc)
    session.execute(
        text("DELETE FROM forecasts WHERE store_id = :s AND metric = :m"),
        {"s": store_id, "m": metric},
    )
    session.execute(
        text("""
            INSERT INTO forecasts
                (store_id, metric, horizon_start, horizon_end, granularity, points, model, generated_at)
            VALUES
                (:store_id, :metric, :hs, :he, 'daily', :points::jsonb, :model, :now)
        """),
        {
            "store_id": store_id,
            "metric":   metric,
            "hs":       now + timedelta(days=1),
            "he":       now + timedelta(days=horizon),
            "points":   json.dumps(result["points"]),
            "model":    result["model"],
            "now":      now,
        },
    )
    session.commit()


# ── historical series fetchers ─────────────────────────────────────────────────

def _fetch_series(
    session: Session,
    store_id: str,
    metric: str,
) -> list[tuple[datetime, float]]:
    since = datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)

    if metric in ("electricity", "water"):
        sql = text("""
            SELECT
                date_trunc('day', ts AT TIME ZONE 'Asia/Kuala_Lumpur') AS day,
                SUM(value)
            FROM meter_readings
            WHERE store_id = :s
              AND resource  = :resource
              AND ts        >= :since
            GROUP BY 1
            ORDER BY 1
        """)
        rows = session.execute(sql, {"s": store_id, "resource": metric, "since": since}).all()

    elif metric == "footfall":
        sql = text("""
            SELECT
                date_trunc('day', ts AT TIME ZONE 'Asia/Kuala_Lumpur') AS day,
                SUM(count)
            FROM footfall_readings
            WHERE store_id = :s
              AND ts        >= :since
            GROUP BY 1
            ORDER BY 1
        """)
        rows = session.execute(sql, {"s": store_id, "since": since}).all()

    else:  # sales
        sql = text("""
            SELECT
                date_trunc('day', ts AT TIME ZONE 'Asia/Kuala_Lumpur') AS day,
                SUM(revenue_myr)
            FROM sales_records
            WHERE store_id = :s
              AND ts        >= :since
            GROUP BY 1
            ORDER BY 1
        """)
        rows = session.execute(sql, {"s": store_id, "since": since}).all()

    return [(row[0], float(row[1] or 0)) for row in rows]


# ── endpoint ───────────────────────────────────────────────────────────────────

@router.get("")
def get_forecast(
    metric:   Metric = Query("footfall"),
    horizon:  int    = Query(7, ge=1, le=365),
    store_id: str    = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    cached = _load_cache(session, store_id, metric)
    if cached:
        cached["metric"]       = metric
        cached["horizon_days"] = horizon
        return cached

    series = _fetch_series(session, store_id, metric)
    result = forecasting.forecast(series, horizon)

    try:
        _save_cache(session, store_id, metric, result, horizon)
    except Exception:
        pass   # cache write failure must not break the response

    return {
        "metric":       metric,
        "model":        result["model"],
        "horizon_days": horizon,
        "points":       result["points"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cached":       False,
    }
