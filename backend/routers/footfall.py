"""
Footfall & Sales router — F4

GET /api/footfall/summary?days=14
GET /api/footfall/trend?days=14
GET /api/footfall/heatmap?days=28
GET /api/footfall/peaks?days=28&top=5
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from services.anomaly_detection import detect
from tenancy import get_store_id

router = APIRouter(prefix="/footfall", tags=["footfall"])


class FootfallIn(BaseModel):
    count: int
    zone: str = "main_entrance"
    ts: Optional[datetime] = None


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/summary")
def footfall_summary(
    days: int = Query(14, ge=1, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> dict:
    now      = datetime.now(timezone.utc)
    cur_from = now - timedelta(days=days)
    prv_from = now - timedelta(days=days * 2)

    f_sql = text("""
        select
            sum(case when ts >= :cur_from then count else 0 end)                    as cur_ff,
            sum(case when ts >= :prv_from and ts < :cur_from then count else 0 end) as prv_ff
        from footfall_readings
        where store_id = :store_id
          and ts >= :prv_from
    """)
    f = session.execute(f_sql, {"store_id": store_id, "cur_from": cur_from, "prv_from": prv_from}).one()
    cur_ff = float(f[0] or 0)
    prv_ff = float(f[1] or 0)
    ff_delta = round(((cur_ff - prv_ff) / prv_ff * 100) if prv_ff else 0, 1)

    s_sql = text("""
        select
            sum(case when ts >= :cur_from then revenue_myr   else 0 end) as cur_rev,
            sum(case when ts >= :prv_from and ts < :cur_from then revenue_myr else 0 end) as prv_rev,
            sum(case when ts >= :cur_from then transactions   else 0 end) as cur_txn,
            sum(case when ts >= :prv_from and ts < :cur_from then transactions else 0 end) as prv_txn
        from sales_records
        where store_id = :store_id
          and ts >= :prv_from
    """)
    s = session.execute(s_sql, {"store_id": store_id, "cur_from": cur_from, "prv_from": prv_from}).one()
    cur_rev = float(s[0] or 0)
    prv_rev = float(s[1] or 0)
    cur_txn = int(s[2] or 0)
    prv_txn = int(s[3] or 0)
    sales_delta = round(((cur_rev - prv_rev) / prv_rev * 100) if prv_rev else 0, 1)

    cur_conv = round(cur_txn / cur_ff * 100, 1) if cur_ff else 0.0
    prv_conv = round(prv_txn / prv_ff * 100, 1) if prv_ff else 0.0
    conv_delta = round(cur_conv - prv_conv, 1)

    return {
        "footfall": {
            "total":     int(cur_ff),
            "avg_daily": round(cur_ff / days, 1),
            "delta_pct": ff_delta,
        },
        "sales": {
            "revenue_myr":          round(cur_rev, 2),
            "transactions":         cur_txn,
            "avg_transaction_myr":  round(cur_rev / cur_txn, 2) if cur_txn else 0.0,
            "delta_pct":            sales_delta,
        },
        "conversion": {
            "rate_pct":  cur_conv,
            "delta_pp":  conv_delta,
        },
    }


@router.get("/trend")
def footfall_trend(
    days: int = Query(14, ge=1, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> list[dict]:
    since = _since(days)

    f_sql = text("""
        select
            date_trunc('day', ts at time zone 'Asia/Kuala_Lumpur') as day,
            sum(count) as footfall
        from footfall_readings
        where store_id = :store_id
          and ts >= :since
        group by 1
        order by 1
    """)
    f_map = {
        str(r[0].date()): int(r[1] or 0)
        for r in session.execute(f_sql, {"store_id": store_id, "since": since}).all()
    }

    s_sql = text("""
        select
            date_trunc('day', ts at time zone 'Asia/Kuala_Lumpur') as day,
            sum(revenue_myr)  as revenue,
            sum(transactions) as txns
        from sales_records
        where store_id = :store_id
          and ts >= :since
        group by 1
        order by 1
    """)
    s_map = {
        str(r[0].date()): (float(r[1] or 0), int(r[2] or 0))
        for r in session.execute(s_sql, {"store_id": store_id, "since": since}).all()
    }

    all_dates = sorted(set(list(f_map.keys()) + list(s_map.keys())))
    out = []
    for d in all_dates:
        ff  = f_map.get(d, 0)
        rev, txns = s_map.get(d, (0.0, 0))
        out.append({
            "date":            d,
            "footfall":        ff,
            "revenue_myr":     round(rev, 2),
            "transactions":    txns,
            "conversion_pct":  round(txns / ff * 100, 1) if ff else 0.0,
        })
    return out


@router.get("/heatmap")
def footfall_heatmap(
    days: int = Query(28, ge=7, le=90),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> list[dict]:
    """Average footfall per (dow, hour) — powers the busyness heatmap."""
    since = _since(days)

    sql = text("""
        select
            extract(dow  from ts at time zone 'Asia/Kuala_Lumpur')::int as dow,
            extract(hour from ts at time zone 'Asia/Kuala_Lumpur')::int as hour,
            avg(count)                                                   as avg_count
        from footfall_readings
        where store_id = :store_id
          and ts >= :since
        group by 1, 2
        order by 1, 2
    """)
    rows = session.execute(sql, {"store_id": store_id, "since": since}).all()

    return [
        {
            "dow":       int(r[0]),
            "hour":      int(r[1]),
            "avg_count": round(float(r[2] or 0), 1),
        }
        for r in rows
    ]


@router.get("/peaks")
def footfall_peaks(
    days: int = Query(28, ge=7, le=90),
    top:  int = Query(5,  ge=1, le=10),
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> list[dict]:
    """Top N (dow, hour) slots by average footfall."""
    since = _since(days)

    DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    sql = text("""
        select
            extract(dow  from ts at time zone 'Asia/Kuala_Lumpur')::int as dow,
            extract(hour from ts at time zone 'Asia/Kuala_Lumpur')::int as hour,
            avg(count)                                                   as avg_count
        from footfall_readings
        where store_id = :store_id
          and ts >= :since
          and count > 0
        group by 1, 2
        order by 3 desc
        limit :top
    """)
    rows = session.execute(sql, {"store_id": store_id, "since": since, "top": top}).all()

    def _label(dow: int, hour: int) -> str:
        h12 = hour % 12 or 12
        end_h = (hour + 1) % 24
        end_h12 = end_h % 12 or 12
        am_pm = "AM" if hour < 12 else "PM"
        end_am_pm = "AM" if end_h < 12 else "PM"
        if am_pm == end_am_pm:
            return f"{DOW_NAMES[dow]} {h12}–{end_h12} {am_pm}"
        return f"{DOW_NAMES[dow]} {h12} {am_pm}–{end_h12} {end_am_pm}"

    return [
        {
            "dow":       int(r[0]),
            "hour":      int(r[1]),
            "avg_count": round(float(r[2] or 0), 1),
            "label":     _label(int(r[0]), int(r[1])),
        }
        for r in rows
    ]


@router.post("/ingest")
def ingest_footfall(
    body:     FootfallIn,
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    """Ingest one footfall reading and run anomaly detection synchronously."""
    ts = body.ts or datetime.now(timezone.utc)

    # Detect BEFORE inserting so the baseline window is clean
    anomaly = detect(session, store_id, "footfall", body.zone, float(body.count), ts)

    session.execute(
        text("""
            INSERT INTO footfall_readings (store_id, zone, count, ts)
            VALUES (:s, :zone, :count, :ts)
        """),
        {"s": store_id, "zone": body.zone, "count": body.count, "ts": ts},
    )
    session.commit()

    return {"ingested": True, "zone": body.zone, "count": body.count,
            "ts": ts.isoformat(), "anomaly": anomaly}
