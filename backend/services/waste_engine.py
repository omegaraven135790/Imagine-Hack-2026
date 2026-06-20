"""
Waste & Optimization Engine — F7

Computes waste stories live from meter readings, inventory, and spoilage data.
Returns a ranked list (highest cost first) without persisting to waste_events,
so results are always fresh and consistent with the current data.

Categories:
    energy_idle    — closed-hour electricity waste by zone (7-day window)
    water_leak     — off-hours water usage suggesting leaks (7-day window)
    stock_spoilage — spoiled / discarded inventory cost (30-day window)
    overstock      — excess non-perishable stock tying up capital
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlmodel import Session

from services.tariff_service import co2e_factor, elec_rate, water_rate

STORE_OPEN_HOUR  = 10
STORE_CLOSE_HOUR = 22
IDLE_WINDOW_DAYS = 7
SPOILAGE_DAYS    = 30
IDLE_CLOSED_HRS  = STORE_OPEN_HOUR + (24 - STORE_CLOSE_HOUR)   # 12 hrs/day


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _latest_anomaly_id(
    session: Session,
    store_id: str,
    metric: str,
    zone: Optional[str],
) -> Optional[str]:
    row = session.execute(
        text("""
            SELECT id FROM anomaly_events
            WHERE store_id = :s
              AND metric    = :metric
              AND (:zone IS NULL OR zone = :zone)
              AND resolved  = false
            ORDER BY ts DESC
            LIMIT 1
        """),
        {"s": store_id, "metric": metric, "zone": zone},
    ).first()
    return str(row[0]) if row else None


def _energy_idle(session: Session, store_id: str, e_rate: float, co2: float) -> list[dict]:
    since = _since(IDLE_WINDOW_DAYS)
    rows = session.execute(
        text("""
            SELECT zone, SUM(value) AS kwh
            FROM meter_readings
            WHERE store_id = :s
              AND resource  = 'electricity'
              AND ts        >= :since
              AND (
                EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kuala_Lumpur') < :open_h
                OR EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kuala_Lumpur') >= :close_h
              )
            GROUP BY zone
            HAVING SUM(value) > 0.5
            ORDER BY kwh DESC
        """),
        {"s": store_id, "since": since,
         "open_h": STORE_OPEN_HOUR, "close_h": STORE_CLOSE_HOUR},
    ).all()

    now  = datetime.now(timezone.utc)
    out  = []
    for zone, kwh in rows:
        kwh       = round(float(kwh or 0), 2)
        cost      = round(kwh * e_rate, 2)
        co2e      = round(kwh * co2, 2)
        zone_lbl  = zone.replace("_", " ").title()
        out.append({
            "category":       "energy_idle",
            "zone":           zone,
            "start_time":     since.isoformat(),
            "end_time":       now.isoformat(),
            "duration_hours": round(IDLE_WINDOW_DAYS * IDLE_CLOSED_HRS, 1),
            "quantity":       kwh,
            "cost_myr":       cost,
            "co2e_kg":        co2e,
            "action": (
                f"Install smart plugs or timers for non-essential equipment in "
                f"{zone_lbl}. Cut power between {STORE_CLOSE_HOUR}:00 and "
                f"{STORE_OPEN_HOUR}:00 to save RM {cost:.2f}/week."
            ),
            "anomaly_id":  _latest_anomaly_id(session, store_id, "electricity", zone),
            "description": (
                f"{zone_lbl}: {kwh:.1f} kWh consumed during closed hours "
                f"over the past {IDLE_WINDOW_DAYS} days."
            ),
        })
    return out


def _water_idle(session: Session, store_id: str, w_rate: float) -> list[dict]:
    since = _since(IDLE_WINDOW_DAYS)
    rows = session.execute(
        text("""
            SELECT zone, SUM(value) AS m3
            FROM meter_readings
            WHERE store_id = :s
              AND resource  = 'water'
              AND ts        >= :since
              AND (
                EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kuala_Lumpur') < :open_h
                OR EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Kuala_Lumpur') >= :close_h
              )
            GROUP BY zone
            HAVING SUM(value) > 0.02
            ORDER BY m3 DESC
        """),
        {"s": store_id, "since": since,
         "open_h": STORE_OPEN_HOUR, "close_h": STORE_CLOSE_HOUR},
    ).all()

    now = datetime.now(timezone.utc)
    out = []
    for zone, m3 in rows:
        m3       = round(float(m3 or 0), 4)
        cost     = round(m3 * w_rate, 2)
        zone_lbl = zone.replace("_", " ").title()
        out.append({
            "category":       "water_leak",
            "zone":           zone,
            "start_time":     since.isoformat(),
            "end_time":       now.isoformat(),
            "duration_hours": round(IDLE_WINDOW_DAYS * IDLE_CLOSED_HRS, 1),
            "quantity":       m3,
            "cost_myr":       cost,
            "co2e_kg":        None,
            "action": (
                f"Inspect {zone_lbl} taps and fittings for drips or running fixtures "
                f"after hours. Install auto-shutoff valves or a leak sensor. "
                f"Estimated saving: RM {cost:.2f}/week."
            ),
            "anomaly_id":  _latest_anomaly_id(session, store_id, "water", zone),
            "description": (
                f"{zone_lbl}: {m3:.3f} m³ water used during closed hours "
                f"over the past {IDLE_WINDOW_DAYS} days — possible unattended tap or slow leak."
            ),
        })
    return out


def _stock_spoilage(session: Session, store_id: str) -> list[dict]:
    since = _since(SPOILAGE_DAYS)
    rows = session.execute(
        text("""
            SELECT
                i.name,
                i.category,
                i.storage_zone,
                SUM(m.qty)                  AS spoiled_qty,
                SUM(ABS(m.cost_impact_myr)) AS cost
            FROM stock_movements m
            JOIN inventory_items i ON i.id = m.item_id
            WHERE m.store_id = :s
              AND m.ts       >= :since
              AND m.type     IN ('spoiled', 'discarded')
            GROUP BY i.id, i.name, i.category, i.storage_zone
            HAVING SUM(ABS(m.cost_impact_myr)) > 0
            ORDER BY cost DESC
            LIMIT 5
        """),
        {"s": store_id, "since": since},
    ).all()

    now = datetime.now(timezone.utc)
    out = []
    for name, category, zone, qty, cost in rows:
        cost = round(float(cost or 0), 2)
        qty  = int(qty or 0)
        out.append({
            "category":       "stock_spoilage",
            "zone":           zone,
            "start_time":     since.isoformat(),
            "end_time":       now.isoformat(),
            "duration_hours": SPOILAGE_DAYS * 24,
            "quantity":       float(qty),
            "cost_myr":       cost,
            "co2e_kg":        None,
            "action": (
                f"Review order cadence for {name}: switch to smaller, more frequent "
                f"deliveries aligned to daily demand. Adjust reorder point or "
                f"negotiate shorter lead times with supplier."
            ),
            "anomaly_id":  None,
            "description": (
                f"{name} ({category}): {qty} units spoiled or discarded "
                f"over the past {SPOILAGE_DAYS} days — RM {cost:.2f} lost."
            ),
        })
    return out


def _overstock(session: Session, store_id: str) -> list[dict]:
    rows = session.execute(
        text("""
            SELECT name, category, storage_zone,
                   current_stock, reorder_point, unit_cost_myr
            FROM inventory_items
            WHERE store_id       = :s
              AND perishable      = false
              AND reorder_point   > 0
              AND current_stock   >= reorder_point * 3
            ORDER BY (current_stock - reorder_point * 3) * unit_cost_myr DESC
            LIMIT 5
        """),
        {"s": store_id},
    ).all()

    now = datetime.now(timezone.utc).isoformat()
    out = []
    for name, category, zone, stock, reorder, unit_cost in rows:
        excess = int(stock) - int(reorder) * 3
        cost   = round(float(excess) * float(unit_cost), 2)
        if cost <= 0:
            continue
        out.append({
            "category":       "overstock",
            "zone":           zone,
            "start_time":     now,
            "end_time":       None,
            "duration_hours": None,
            "quantity":       float(excess),
            "cost_myr":       cost,
            "co2e_kg":        None,
            "action": (
                f"Pause new orders for {name} until stock falls to the reorder point "
                f"({reorder} units). Consider a bundle deal or in-store promotion "
                f"to move the excess {excess} units faster."
            ),
            "anomaly_id":  None,
            "description": (
                f"{name} ({category}): {stock} units in stock vs reorder point {reorder}. "
                f"Excess ~{excess} units ties up RM {cost:.2f} in working capital."
            ),
        })
    return out


def compute(session: Session, store_id: str) -> list[dict]:
    """Return all waste stories ranked by cost_myr descending."""
    e_rate = elec_rate(session)
    w_rate = water_rate(session)
    co2    = co2e_factor(session)

    events = (
        _energy_idle(session, store_id, e_rate, co2)
        + _water_idle(session, store_id, w_rate)
        + _stock_spoilage(session, store_id)
        + _overstock(session, store_id)
    )
    events.sort(key=lambda x: x["cost_myr"], reverse=True)
    return events
