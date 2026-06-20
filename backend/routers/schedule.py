"""
Schedule router — F8

POST /api/schedule/generate   Run CP-SAT solver for the target week
GET  /api/schedule            Read stored schedule for a week
GET  /api/schedule/staff      Staff roster + availability
GET  /api/schedule/csv        Download CSV
"""

from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from services import scheduler
from tenancy import get_store_id

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _upcoming_monday() -> date:
    today = date.today()
    days  = (7 - today.weekday()) % 7
    return today + timedelta(days=days)


def _parse_week(raw: str | None) -> date:
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
    return _upcoming_monday()


# ── generate ──────────────────────────────────────────────────────────────────

@router.post("/generate")
def generate_schedule(
    days:       int      = Query(7, ge=1, le=14),
    week_start: str      = Query(None),
    store_id:   str      = Depends(get_store_id),
    session:    Session  = Depends(get_session),
) -> dict:
    ws     = _parse_week(week_start)
    result = scheduler.generate(session, store_id, ws, days)

    generated_at = datetime.now(timezone.utc)
    _persist(session, store_id, ws, days, result["assignments"], generated_at)

    return {**result, "generated_at": generated_at.isoformat()}


def _persist(
    session:      Session,
    store_id:     str,
    week_start:   date,
    horizon_days: int,
    assignments:  list[dict],
    generated_at: datetime,
) -> None:
    week_end = week_start + timedelta(days=horizon_days)
    session.execute(
        text("""
            DELETE FROM schedule_entries
            WHERE store_id = :s AND date >= :ws AND date < :we
        """),
        {"s": store_id, "ws": week_start, "we": week_end},
    )
    for a in assignments:
        session.execute(
            text("""
                INSERT INTO schedule_entries
                    (store_id, staff_id, staff_name, date, shift, role, generated_at)
                VALUES
                    (:store_id, :staff_id, :staff_name, :date, :shift, :role, :ga)
            """),
            {
                "store_id":   store_id,
                "staff_id":   a["staff_id"],
                "staff_name": a["staff_name"],
                "date":       a["date"],
                "shift":      a["shift"],
                "role":       a["role"],
                "ga":         generated_at,
            },
        )
    session.commit()


# ── read ─────────────────────────────────────────────────────────────────────

@router.get("")
def get_schedule(
    week_start: str      = Query(None),
    store_id:   str      = Depends(get_store_id),
    session:    Session  = Depends(get_session),
) -> dict:
    ws       = _parse_week(week_start)
    week_end = ws + timedelta(days=7)

    rows = session.execute(
        text("""
            SELECT se.staff_id, se.staff_name, se.date, se.shift, se.role,
                   s.hourly_rate_myr, se.generated_at
            FROM schedule_entries se
            JOIN staff s ON s.id = se.staff_id
            WHERE se.store_id = :store_id
              AND se.date >= :ws AND se.date < :we
            ORDER BY se.date, se.shift, se.staff_name
        """),
        {"store_id": store_id, "ws": ws, "we": week_end},
    ).all()

    SHIFT_H      = scheduler.SHIFT_HOURS
    assignments  = []
    total_cost   = 0.0
    generated_at = None

    for r in rows:
        h    = SHIFT_H.get(r[3], 5)
        cost = float(r[5]) * h
        total_cost += cost
        if r[6] and not generated_at:
            generated_at = r[6]
        assignments.append({
            "staff_id":   r[0],
            "staff_name": r[1],
            "date":       r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2]),
            "shift":      r[3],
            "role":       r[4],
            "cost_myr":   round(cost, 2),
        })

    staff_count  = len({a["staff_id"] for a in assignments})
    demand_ctx   = scheduler.get_demand_context(session, store_id, ws)
    return {
        "week_start":     ws.isoformat(),
        "assignments":    assignments,
        "total_cost_myr": round(total_cost, 2),
        "staff_count":    staff_count,
        "generated_at":   (
            generated_at.isoformat()
            if generated_at and hasattr(generated_at, "isoformat")
            else None
        ),
        "demand":         demand_ctx,
    }


# ── staff roster ──────────────────────────────────────────────────────────────

@router.get("/staff")
def get_staff(
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> list[dict]:
    rows = session.execute(
        text("""
            SELECT s.id, s.name, s.role, s.hourly_rate_myr, s.max_hours_week,
                   json_object_agg(sa.day_of_week::text, sa.available
                     ORDER BY sa.day_of_week) AS availability
            FROM staff s
            LEFT JOIN staff_availability sa
                   ON sa.staff_id = s.id AND sa.store_id = s.store_id
            WHERE s.store_id = :s
            GROUP BY s.id, s.name, s.role, s.hourly_rate_myr, s.max_hours_week
            ORDER BY s.name
        """),
        {"s": store_id},
    ).all()

    result = []
    for r in rows:
        raw   = r[5] or {}
        avail = raw if isinstance(raw, dict) else json.loads(raw)
        result.append({
            "id":               r[0],
            "name":             r[1],
            "role":             r[2],
            "hourly_rate_myr":  float(r[3]),
            "max_hours_week":   int(r[4]),
            "availability":     {int(k): v for k, v in avail.items()},
        })
    return result


# ── csv export ────────────────────────────────────────────────────────────────

@router.get("/csv")
def get_schedule_csv(
    week_start: str     = Query(None),
    store_id:   str     = Depends(get_store_id),
    session:    Session = Depends(get_session),
) -> StreamingResponse:
    ws       = _parse_week(week_start)
    week_end = ws + timedelta(days=7)

    rows = session.execute(
        text("""
            SELECT se.staff_name, se.role, se.date, se.shift, s.hourly_rate_myr
            FROM schedule_entries se
            JOIN staff s ON s.id = se.staff_id
            WHERE se.store_id = :store_id
              AND se.date >= :ws AND se.date < :we
            ORDER BY se.date, se.shift, se.staff_name
        """),
        {"store_id": store_id, "ws": ws, "we": week_end},
    ).all()

    SHIFT_H = scheduler.SHIFT_HOURS
    buf     = io.StringIO()
    writer  = csv.writer(buf)
    writer.writerow(["Name", "Role", "Date", "Shift", "Hours", "Labor Cost (MYR)"])
    for r in rows:
        h    = SHIFT_H.get(r[3], 5)
        cost = float(r[4]) * h
        d    = r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2])
        writer.writerow([r[0], r[1], d, r[3], h, f"{cost:.2f}"])

    buf.seek(0)
    filename = f"schedule_{ws.isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
