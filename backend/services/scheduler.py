"""
Demand-driven staff scheduler — F8

Uses CP-SAT (OR-Tools) to produce a weekly roster driven by forecasted footfall.
Falls back to a greedy algorithm if the solver times out or OR-Tools is absent.

Distribution guarantees:
  - At least 1 staff per day (across all shifts)
  - No single staff works more than ceil(total_slots / n_staff) + 1 shifts/week
  - Greedy rotates priority so the same person doesn't dominate every day

Shifts (for a 10–22 store):
  morning   10:00–15:00  5 h  → 30 % of daily footfall
  afternoon 14:00–19:00  5 h  → 45 % of daily footfall (peak)
  evening   18:00–22:00  4 h  → 25 % of daily footfall
"""

from __future__ import annotations

import json
import math
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlmodel import Session

SOLVER_TIMEOUT_S   = 2.8
VISITORS_PER_STAFF = 120
SHIFT_FRACTIONS    = {"morning": 0.30, "afternoon": 0.45, "evening": 0.25}
SHIFT_HOURS        = {"morning": 5,    "afternoon": 5,    "evening": 4}
SHIFTS             = list(SHIFT_HOURS.keys())


# ── public API ────────────────────────────────────────────────────────────────

def generate(
    session: Session,
    store_id: str,
    week_start: date,
    horizon_days: int = 7,
) -> dict:
    days  = [week_start + timedelta(days=i) for i in range(horizon_days)]
    staff = _get_staff(session, store_id)
    if not staff:
        return {
            "method":         "greedy",
            "week_start":     week_start.isoformat(),
            "assignments":    [],
            "total_cost_myr": 0.0,
            "solve_ms":       0,
            "demand":         {},
        }

    demand, day_footfall = _get_demand(session, store_id, days)

    t0     = time.monotonic()
    result = _cpsat(staff, days, demand, SOLVER_TIMEOUT_S)
    method = "cpsat" if result is not None else "greedy"
    if result is None:
        result = _greedy(staff, days, demand)
    elapsed_ms = round((time.monotonic() - t0) * 1000)

    total_cost = sum(a["cost_myr"] for a in result)
    return {
        "method":         method,
        "week_start":     week_start.isoformat(),
        "assignments":    result,
        "total_cost_myr": round(total_cost, 2),
        "solve_ms":       elapsed_ms,
        "demand":         _build_demand_context(days, demand, day_footfall),
    }


def get_demand_context(session: Session, store_id: str, week_start: date, horizon_days: int = 7) -> dict:
    """Returns footfall + required-staff context for a week without running the solver."""
    days = [week_start + timedelta(days=i) for i in range(horizon_days)]
    demand, day_footfall = _get_demand(session, store_id, days)
    return _build_demand_context(days, demand, day_footfall)


def _build_demand_context(
    days: list[date],
    demand: dict[tuple, int],
    day_footfall: dict[date, float],
) -> dict:
    return {
        day.isoformat(): {
            "footfall": round(day_footfall.get(day, 0)),
            "required": {sh: demand.get((i, sh), 1) for sh in SHIFTS},
        }
        for i, day in enumerate(days)
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_staff(session: Session, store_id: str) -> list[dict]:
    rows = session.execute(
        text("""
            SELECT s.id, s.name, s.role, s.hourly_rate_myr, s.max_hours_week,
                   array_agg(sa.day_of_week ORDER BY sa.day_of_week)
                     FILTER (WHERE sa.available = true) AS avail_days
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
        avail = r[5]
        avail_set = set(avail) if (avail and avail[0] is not None) else set(range(7))
        result.append({
            "id":        r[0],
            "name":      r[1],
            "role":      r[2],
            "rate":      float(r[3]),
            "max_hours": int(r[4]),
            "avail":     avail_set,
        })
    return result


def _get_demand(
    session: Session,
    store_id: str,
    days: list[date],
) -> tuple[dict[tuple, int], dict[date, float]]:
    since = datetime.now(timezone.utc) - timedelta(hours=12)
    row = session.execute(
        text("""
            SELECT points FROM forecasts
            WHERE store_id = :s AND metric = 'footfall'
              AND generated_at >= :since
            ORDER BY generated_at DESC LIMIT 1
        """),
        {"s": store_id, "since": since},
    ).first()

    day_footfall: dict[date, float] = {}
    if row:
        pts = row[0] if isinstance(row[0], list) else json.loads(row[0])
        for pt in pts:
            try:
                d = date.fromisoformat(str(pt["ts"])[:10])
                day_footfall[d] = float(pt["predicted"])
            except Exception:
                pass

    # For missing days use a per-day-of-week historical average so weekends differ from weekdays
    missing = [d for d in days if d not in day_footfall]
    if missing:
        dow_avgs: dict[int, float] = {}
        avg_rows = session.execute(
            text("""
                SELECT dow, AVG(daily_count) AS avg_count
                FROM (
                    SELECT EXTRACT(DOW FROM date_trunc('day', ts))::int AS dow,
                           SUM(count) AS daily_count
                    FROM footfall_readings
                    WHERE store_id = :s
                    GROUP BY date_trunc('day', ts)
                ) sub
                GROUP BY dow
            """),
            {"s": store_id},
        ).all()
        # Postgres DOW: 0=Sun, convert to Python weekday: 0=Mon
        for r in avg_rows:
            pg_dow     = int(r[0])
            py_dow     = (pg_dow - 1) % 7   # 0=Mon..6=Sun
            dow_avgs[py_dow] = float(r[1] or 0)

        for d in missing:
            day_footfall[d] = dow_avgs.get(d.weekday(), 200.0)

    demand: dict[tuple, int] = {}
    for i, d in enumerate(days):
        daily = max(0.0, day_footfall.get(d, 200.0))
        for shift, frac in SHIFT_FRACTIONS.items():
            demand[(i, shift)] = max(1, math.ceil(daily * frac / VISITORS_PER_STAFF))

    return demand, day_footfall


# ── solvers ───────────────────────────────────────────────────────────────────

def _cpsat(
    staff: list[dict],
    days: list[date],
    demand: dict[tuple, int],
    timeout_s: float,
) -> list[dict] | None:
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None

    model   = cp_model.CpModel()
    n_staff = len(staff)
    n_days  = len(days)

    x: dict[tuple, Any] = {}
    for s in range(n_staff):
        for d in range(n_days):
            dow = days[d].weekday()
            for sh in SHIFTS:
                if dow in staff[s]["avail"]:
                    x[s, d, sh] = model.new_bool_var(f"x_{s}_{d}_{sh}")

    # ── hard constraints ──────────────────────────────────────────────────────

    # at most 1 shift per staff per day
    for s in range(n_staff):
        for d in range(n_days):
            vs = [x[s, d, sh] for sh in SHIFTS if (s, d, sh) in x]
            if len(vs) > 1:
                model.add(sum(vs) <= 1)

    # weekly hours cap per staff
    for s in range(n_staff):
        terms = [
            x[s, d, sh] * SHIFT_HOURS[sh]
            for d in range(n_days) for sh in SHIFTS
            if (s, d, sh) in x
        ]
        if terms:
            model.add(sum(terms) <= staff[s]["max_hours"])

    # fair distribution: cap max shifts per person so no one dominates
    total_demand = sum(demand.values())
    max_shifts   = math.ceil(total_demand / n_staff) + 1
    for s in range(n_staff):
        shift_vars = [x[s, d, sh] for d in range(n_days) for sh in SHIFTS if (s, d, sh) in x]
        if shift_vars and len(shift_vars) > max_shifts:
            model.add(sum(shift_vars) <= max_shifts)

    # everyone must work at least 1 shift (if they have any available slot)
    for s in range(n_staff):
        shift_vars = [x[s, d, sh] for d in range(n_days) for sh in SHIFTS if (s, d, sh) in x]
        if shift_vars:
            model.add(sum(shift_vars) >= 1)

    # meet demand per shift (capped to available count to stay feasible)
    for d in range(n_days):
        for sh in SHIFTS:
            required = demand.get((d, sh), 1)
            avail    = [x[s, d, sh] for s in range(n_staff) if (s, d, sh) in x]
            if not avail:
                continue
            model.add(sum(avail) >= min(required, len(avail)))

    # at least 1 total staff per day (belt-and-suspenders across all shifts)
    for d in range(n_days):
        day_vars = [x[s, d, sh] for s in range(n_staff) for sh in SHIFTS if (s, d, sh) in x]
        if day_vars:
            model.add(sum(day_vars) >= 1)

    # at least 1 supervisor per day when available
    sup_idxs = [s for s, st in enumerate(staff) if st["role"] == "supervisor"]
    if sup_idxs:
        for d in range(n_days):
            vs = [x[s, d, sh] for s in sup_idxs for sh in SHIFTS if (s, d, sh) in x]
            if vs:
                model.add(sum(vs) >= 1)

    # minimize cost (integer: rate in cents × hours)
    cost_terms = [
        x[s, d, sh] * int(staff[s]["rate"] * 100) * SHIFT_HOURS[sh]
        for s in range(n_staff) for d in range(n_days) for sh in SHIFTS
        if (s, d, sh) in x
    ]
    if cost_terms:
        model.minimize(sum(cost_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = timeout_s
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    assignments = []
    for s in range(n_staff):
        for d in range(n_days):
            for sh in SHIFTS:
                if (s, d, sh) in x and solver.value(x[s, d, sh]) == 1:
                    assignments.append({
                        "staff_id":   staff[s]["id"],
                        "staff_name": staff[s]["name"],
                        "role":       staff[s]["role"],
                        "date":       days[d].isoformat(),
                        "shift":      sh,
                        "cost_myr":   round(staff[s]["rate"] * SHIFT_HOURS[sh], 2),
                    })
    return assignments


def _greedy(
    staff: list[dict],
    days: list[date],
    demand: dict[tuple, int],
) -> list[dict]:
    hours_used   = {st["id"]: 0 for st in staff}
    shift_count  = {st["id"]: 0 for st in staff}
    assignments  = []

    total_demand = sum(demand.values())
    max_shifts   = math.ceil(total_demand / max(len(staff), 1)) + 1

    # Base priority: supervisors first, then by rate ascending
    base_order = sorted(staff, key=lambda st: (0 if st["role"] == "supervisor" else 1, st["rate"]))
    n          = len(base_order)

    for d, day in enumerate(days):
        dow        = day.weekday()
        worked_ids: set[str] = set()

        # Rotate starting position each day so different people lead each day
        rotated = base_order[d % n:] + base_order[:d % n]

        # Ensure at least 1 staff per day: track if anyone has been assigned yet
        day_assigned = 0

        for sh in SHIFTS:
            required = demand.get((d, sh), 1)
            assigned = 0

            for st in rotated:
                if assigned >= required:
                    break
                if dow not in st["avail"]:
                    continue
                if st["id"] in worked_ids:
                    continue
                if hours_used[st["id"]] + SHIFT_HOURS[sh] > st["max_hours"]:
                    continue
                if shift_count[st["id"]] >= max_shifts:
                    continue

                worked_ids.add(st["id"])
                hours_used[st["id"]] += SHIFT_HOURS[sh]
                shift_count[st["id"]] += 1
                day_assigned += 1
                assignments.append({
                    "staff_id":   st["id"],
                    "staff_name": st["name"],
                    "role":       st["role"],
                    "date":       day.isoformat(),
                    "shift":      sh,
                    "cost_myr":   round(st["rate"] * SHIFT_HOURS[sh], 2),
                })
                assigned += 1

        # Guarantee at least 1 person per day: if day is empty, assign any available staff
        if day_assigned == 0:
            for st in rotated:
                if dow not in st["avail"]:
                    continue
                hours_used[st["id"]] += SHIFT_HOURS["morning"]
                shift_count[st["id"]] += 1
                assignments.append({
                    "staff_id":   st["id"],
                    "staff_name": st["name"],
                    "role":       st["role"],
                    "date":       day.isoformat(),
                    "shift":      "morning",
                    "cost_myr":   round(st["rate"] * SHIFT_HOURS["morning"], 2),
                })
                break

    return assignments
