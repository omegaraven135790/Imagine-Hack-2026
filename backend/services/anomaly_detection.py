"""
Anomaly Detection Service — F6

Z-score + IQR outlier detection generalised across all metrics:
  electricity, water, footfall, sales

Call detect() synchronously after each ingest, before committing the new row
so the baseline window is clean (doesn't include the value being tested).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlmodel import Session

# ── thresholds ─────────────────────────────────────────────────────────────────

Z_HIGH = 3.5   # |z| ≥ 3.5 → HIGH regardless of IQR
Z_MED  = 2.5   # |z| ≥ 2.5 → MEDIUM (+ must be IQR outlier)
Z_LOW  = 2.0   # |z| ≥ 2.0 → LOW (+ must be IQR outlier)

WIN_Z_DAYS   = 7   # rolling window for z-score baseline
WIN_IQR_DAYS = 30  # longer window for IQR fence
MIN_HISTORY  = 12  # minimum readings required before detection fires


# ── helpers ────────────────────────────────────────────────────────────────────

def _severity(az: float) -> str:
    if az >= Z_HIGH: return "HIGH"
    if az >= Z_MED:  return "MEDIUM"
    return "LOW"


_METRIC_META = {
    "electricity": ("kWh",      "Electricity"),
    "water":       ("m³",       "Water consumption"),
    "footfall":    ("visitors", "Footfall"),
    "sales":       ("RM",       "Sales revenue"),
}


def _description(metric: str, zone: Optional[str], value: float, z: float, sev: str) -> str:
    unit, label = _METRIC_META.get(metric, ("units", metric.capitalize()))
    direction   = "above" if z > 0 else "below"
    zone_str    = f" ({zone.replace('_', ' ')})" if zone else ""
    follow_up   = "Investigate immediately." if sev == "HIGH" else "Monitor closely."
    return (
        f"{label}{zone_str} recorded {value:,.2f} {unit} — "
        f"{abs(z):.1f}σ {direction} the {WIN_Z_DAYS}-day mean. {follow_up}"
    )


def _load_series(
    session: Session,
    store_id: str,
    metric: str,
    zone: Optional[str],
    days: int,
) -> list[float]:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    if metric in ("electricity", "water"):
        rows = session.execute(
            text("""
                SELECT value FROM meter_readings
                WHERE store_id = :s
                  AND resource  = :resource
                  AND ts       >= :since
                  AND (:zone IS NULL OR zone = :zone)
                ORDER BY ts
            """),
            {"s": store_id, "resource": metric, "since": since, "zone": zone},
        ).all()

    elif metric == "footfall":
        rows = session.execute(
            text("""
                SELECT count FROM footfall_readings
                WHERE store_id = :s
                  AND ts       >= :since
                  AND (:zone IS NULL OR zone = :zone)
                ORDER BY ts
            """),
            {"s": store_id, "since": since, "zone": zone},
        ).all()

    elif metric == "sales":
        rows = session.execute(
            text("""
                SELECT revenue_myr FROM sales_records
                WHERE store_id = :s
                  AND ts       >= :since
                ORDER BY ts
            """),
            {"s": store_id, "since": since},
        ).all()

    else:
        return []

    return [float(r[0]) for r in rows if r[0] is not None]


def _iqr_outlier(values: list[float], v: float) -> bool:
    if len(values) < 4:
        return False
    arr = np.array(values, dtype=float)
    q1, q3 = float(np.percentile(arr, 25)), float(np.percentile(arr, 75))
    iqr = q3 - q1
    if iqr == 0:
        return False
    return v < q1 - 1.5 * iqr or v > q3 + 1.5 * iqr


# ── public API ─────────────────────────────────────────────────────────────────

def detect(
    session:  Session,
    store_id: str,
    metric:   str,
    zone:     Optional[str],
    value:    float,
    ts:       datetime,
) -> dict | None:
    """
    Run Z-score + IQR anomaly detection for one incoming reading.

    Call this BEFORE inserting the new row so the baseline window doesn't
    include the reading being tested.  If triggered, inserts a row into
    anomaly_events and commits, then returns a summary dict.  Returns None
    if no anomaly is detected.
    """
    z_series = _load_series(session, store_id, metric, zone, WIN_Z_DAYS)
    if len(z_series) < MIN_HISTORY:
        return None

    arr  = np.array(z_series, dtype=float)
    mean = float(arr.mean())
    std  = float(arr.std(ddof=1))

    if std < 1e-9:
        return None

    z  = (value - mean) / std
    az = abs(z)

    iqr_series   = _load_series(session, store_id, metric, zone, WIN_IQR_DAYS)
    is_iqr_out   = _iqr_outlier(iqr_series, value)

    if not (az >= Z_HIGH or (az >= Z_LOW and is_iqr_out)):
        return None

    sev  = _severity(az)
    desc = _description(metric, zone, value, z, sev)

    session.execute(
        text("""
            INSERT INTO anomaly_events
                (store_id, metric, zone, value, z_score, severity, description, ts, resolved)
            VALUES
                (:store_id, :metric, :zone, :value, :z, :sev, :desc, :ts, false)
        """),
        {
            "store_id": store_id,
            "metric":   metric,
            "zone":     zone,
            "value":    value,
            "z":        round(z, 2),
            "sev":      sev,
            "desc":     desc,
            "ts":       ts,
        },
    )
    session.commit()

    return {
        "metric":      metric,
        "zone":        zone,
        "value":       value,
        "z_score":     round(z, 2),
        "severity":    sev,
        "description": desc,
    }
