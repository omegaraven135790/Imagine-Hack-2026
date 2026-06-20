"""
Anomalies router — F6

GET  /api/anomalies              — list with filters (metric, severity, resolved)
POST /api/anomalies/{id}/resolve — mark an anomaly resolved
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from tenancy import get_store_id

router = APIRouter(prefix="/anomalies", tags=["anomalies"])

_SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


def _row_to_dict(row) -> dict:
    ts = row[7]
    return {
        "id":          row[0],
        "store_id":    row[1],
        "metric":      row[2],
        "zone":        row[3],
        "value":       float(row[4]),
        "z_score":     float(row[5]),
        "severity":    row[6],
        "ts":          ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
        "description": row[8],
        "resolved":    bool(row[9]),
    }


@router.get("")
def list_anomalies(
    metric:   Optional[str]                                  = Query(None),
    severity: Optional[Literal["HIGH", "MEDIUM", "LOW"]]    = Query(None),
    resolved: bool                                           = Query(False),
    limit:    int           = Query(100, ge=1, le=500),
    store_id: str           = Depends(get_store_id),
    session:  Session       = Depends(get_session),
) -> list[dict]:
    sql = """
        SELECT id, store_id, metric, zone, value, z_score, severity, ts, description, resolved
        FROM anomaly_events
        WHERE store_id = :s
          AND resolved  = :resolved
    """
    params: dict = {"s": store_id, "resolved": resolved}

    if metric:
        sql += " AND metric = :metric"
        params["metric"] = metric

    if severity:
        sql += " AND severity = :severity"
        params["severity"] = severity

    sql += " ORDER BY ts DESC LIMIT :limit"
    params["limit"] = limit

    rows   = session.execute(text(sql), params).all()
    events = [_row_to_dict(r) for r in rows]
    # Re-sort: severity first (HIGH→MEDIUM→LOW), then most recent
    events.sort(key=lambda e: (_SEV_ORDER.get(e["severity"], 3), e["ts"]))
    return events


@router.get("/counts")
def anomaly_counts(
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    """Return counts of unresolved anomalies by severity — for dashboard badges."""
    rows = session.execute(
        text("""
            SELECT severity, COUNT(*) as n
            FROM anomaly_events
            WHERE store_id = :s AND resolved = false
            GROUP BY severity
        """),
        {"s": store_id},
    ).all()
    counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "total": 0}
    for sev, n in rows:
        counts[sev] = int(n)
        counts["total"] += int(n)
    return counts


@router.post("/{anomaly_id}/resolve", status_code=status.HTTP_200_OK)
def resolve_anomaly(
    anomaly_id: str,
    store_id: str     = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    result = session.execute(
        text("""
            UPDATE anomaly_events
            SET resolved = true
            WHERE id = :id AND store_id = :s
            RETURNING id, resolved
        """),
        {"id": anomaly_id, "s": store_id},
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    session.commit()
    return {"id": result[0], "resolved": bool(result[1])}
