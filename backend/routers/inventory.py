"""
Inventory & Stock router — F3

GET /api/inventory/summary
GET /api/inventory/items
GET /api/inventory/spoilage?days=30
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlmodel import Session

from database import get_session
from tenancy import get_store_id

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _status(stock: int, reorder: int, perishable: bool, shelf: int | None, doc: float | None) -> str:
    if stock <= 0:
        return "out_of_stock"
    # at_risk takes priority for perishables: too much stock relative to shelf life
    if perishable and shelf and doc is not None and doc > shelf:
        return "at_risk"
    if stock <= reorder:
        return "low_stock"
    if stock >= reorder * 3:
        return "overstock"
    return "ok"


_ITEM_SQL = text("""
    SELECT
        i.id,
        i.sku,
        i.name,
        i.category,
        i.unit_cost_myr,
        i.perishable,
        i.shelf_life_days,
        i.reorder_point,
        i.current_stock,
        i.storage_zone,
        COALESCE(SUM(CASE WHEN m.type IN ('sold','spoiled','discarded') THEN m.qty ELSE 0 END), 0) AS consumed_90d,
        COALESCE(SUM(CASE WHEN m.type IN ('spoiled','discarded') THEN m.qty               ELSE 0 END), 0) AS spoiled_90d,
        COALESCE(SUM(CASE WHEN m.type IN ('spoiled','discarded') THEN ABS(m.cost_impact_myr) ELSE 0 END), 0) AS spoilage_cost_90d
    FROM inventory_items i
    LEFT JOIN stock_movements m
        ON  m.item_id  = i.id
        AND m.store_id = :store_id
        AND m.ts       >= :since
    WHERE i.store_id = :store_id
    GROUP BY
        i.id, i.sku, i.name, i.category, i.unit_cost_myr,
        i.perishable, i.shelf_life_days, i.reorder_point,
        i.current_stock, i.storage_zone
    ORDER BY i.category, i.sku
""")

_STATUS_ORDER = {"out_of_stock": 0, "at_risk": 1, "low_stock": 2, "overstock": 3, "ok": 4}


def _enrich(row) -> dict:
    consumed  = float(row[10] or 0)
    avg_daily = consumed / 90 if consumed > 0 else None
    stock     = int(row[8])
    doc       = round(stock / avg_daily, 1) if avg_daily and avg_daily > 0 else None
    reorder   = int(row[7])
    perishable = bool(row[5])
    shelf      = row[6]
    st         = _status(stock, reorder, perishable, shelf, doc)
    return {
        "id":                str(row[0]),
        "sku":               row[1],
        "name":              row[2],
        "category":          row[3],
        "unit_cost_myr":     float(row[4]),
        "perishable":        perishable,
        "shelf_life_days":   shelf,
        "reorder_point":     reorder,
        "current_stock":     stock,
        "storage_zone":      row[9],
        "consumed_90d":      int(consumed),
        "avg_daily":         round(avg_daily, 1) if avg_daily else None,
        "days_of_cover":     doc,
        "spoiled_90d":       int(row[11] or 0),
        "spoilage_cost_90d": round(float(row[12] or 0), 2),
        "status":            st,
        "reorder_qty":       max(0, reorder * 2 - stock) if st in ("low_stock", "out_of_stock") else None,
    }


@router.get("/summary")
def inventory_summary(
    store_id: str = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    rows  = session.execute(_ITEM_SQL, {"store_id": store_id, "since": _since(90)}).all()
    items = [_enrich(r) for r in rows]

    counts: dict[str, int] = {"low_stock": 0, "at_risk": 0, "overstock": 0, "out_of_stock": 0}
    total_spoilage = 0.0
    for it in items:
        if it["status"] in counts:
            counts[it["status"]] += 1
        total_spoilage += it["spoilage_cost_90d"]

    return {
        "total_items":       len(items),
        "low_stock":         counts["low_stock"] + counts["out_of_stock"],
        "at_risk":           counts["at_risk"],
        "overstock":         counts["overstock"],
        "spoilage_cost_myr": round(total_spoilage, 2),
    }


@router.get("/items")
def inventory_items(
    store_id: str = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> list[dict]:
    rows  = session.execute(_ITEM_SQL, {"store_id": store_id, "since": _since(90)}).all()
    items = [_enrich(r) for r in rows]
    items.sort(key=lambda x: _STATUS_ORDER.get(x["status"], 9))
    return items


@router.get("/spoilage")
def inventory_spoilage(
    days:     int = Query(30, ge=7, le=90),
    store_id: str = Depends(get_store_id),
    session:  Session = Depends(get_session),
) -> dict:
    sql = text("""
        SELECT
            i.name,
            i.sku,
            i.category,
            SUM(m.qty)                  AS spoiled_qty,
            SUM(ABS(m.cost_impact_myr)) AS spoilage_cost
        FROM stock_movements m
        JOIN inventory_items i ON i.id = m.item_id
        WHERE m.store_id = :store_id
          AND m.ts       >= :since
          AND m.type     IN ('spoiled', 'discarded')
        GROUP BY i.id, i.name, i.sku, i.category
        HAVING SUM(m.qty) > 0
        ORDER BY SUM(ABS(m.cost_impact_myr)) DESC
    """)
    rows = session.execute(sql, {"store_id": store_id, "since": _since(days)}).all()
    item_list = [
        {
            "name":              r[0],
            "sku":               r[1],
            "category":          r[2],
            "spoiled_qty":       int(r[3] or 0),
            "spoilage_cost_myr": round(float(r[4] or 0), 2),
        }
        for r in rows
    ]
    return {
        "days":               days,
        "total_spoilage_myr": round(sum(i["spoilage_cost_myr"] for i in item_list), 2),
        "items":              item_list,
    }
