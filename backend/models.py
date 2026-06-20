"""
SQLModel table definitions for ResWatch Retail — mirrors the Supabase schema.
Models are added phase by phase; see PROJECT_PLAN.md §10 for the phase map.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid4())


# ── Phase 0, Step 0.3 — Tenancy ─────────────────────────────────────────────

class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=_now)


class Store(SQLModel, table=True):
    __tablename__ = "stores"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    org_id: str = Field(foreign_key="organizations.id")
    name: str
    location: Optional[str] = None
    floor_area_sqm: Optional[float] = None
    max_occupancy: Optional[int] = None
    open_hour: int = 9
    close_hour: int = 21
    timezone: str = "Asia/Kuala_Lumpur"
    created_at: datetime = Field(default_factory=_now)


class Membership(SQLModel, table=True):
    __tablename__ = "memberships"

    user_id: str = Field(foreign_key="auth.users.id", primary_key=True)
    org_id: str = Field(foreign_key="organizations.id", primary_key=True)
    role: str = "viewer"
    created_at: datetime = Field(default_factory=_now)


# ── Phase 0, Step 0.6 — Tariffs ─────────────────────────────────────────────

class Tariff(SQLModel, table=True):
    __tablename__ = "tariffs"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    resource: str                    # electricity | water
    region: str                      # peninsular | sabah | sarawak | selangor
    effective_date: date
    components: str                  # JSON string (jsonb in DB)
    afa_sen_per_kwh: float = 0.0
    co2e_factor: float = 0.574
    source_url: Optional[str] = None
    fetched_at: datetime = Field(default_factory=_now)
    is_fallback: bool = False


# ── Phase 1, Step 1.1 — Energy & Water ──────────────────────────────────────

class MeterReading(SQLModel, table=True):
    __tablename__ = "meter_readings"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    resource: str                    # electricity | water
    zone: str
    value: float
    unit: str                        # kWh | m3
    ts: datetime = Field(default_factory=_now)


# ── Phase 1, Step 1.2 — Footfall & Sales ────────────────────────────────────

class FootfallReading(SQLModel, table=True):
    __tablename__ = "footfall_readings"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    zone: str = "main_entrance"
    count: int
    ts: datetime = Field(default_factory=_now)


class SalesRecord(SQLModel, table=True):
    __tablename__ = "sales_records"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    ts: datetime
    revenue_myr: float
    transactions: int
    units_sold: int
    category: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


# ── Phase 1, Step 1.3 — Inventory ───────────────────────────────────────────

class InventoryItem(SQLModel, table=True):
    __tablename__ = "inventory_items"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    sku: str
    name: str
    category: str
    unit_cost_myr: float
    perishable: bool = False
    shelf_life_days: Optional[int] = None
    reorder_point: int = 0
    current_stock: int = 0
    storage_zone: str = "ambient"    # cold | dry | ambient
    created_at: datetime = Field(default_factory=_now)


class StockMovement(SQLModel, table=True):
    __tablename__ = "stock_movements"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    item_id: str = Field(foreign_key="inventory_items.id")
    type: str                        # received | sold | spoiled | discarded | adjusted
    qty: int
    cost_impact_myr: float
    ts: datetime = Field(default_factory=_now)


# ── Phase 0, Step 0.3 — Staff & Scheduling ──────────────────────────────────

class Staff(SQLModel, table=True):
    __tablename__ = "staff"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    name: str
    role: str = "associate"
    hourly_rate_myr: float = 8.00
    max_hours_week: int = 44
    created_at: datetime = Field(default_factory=_now)


class StaffAvailability(SQLModel, table=True):
    __tablename__ = "staff_availability"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    staff_id: str = Field(foreign_key="staff.id")
    store_id: str = Field(foreign_key="stores.id")
    day_of_week: int                 # 0=Mon .. 6=Sun
    available: bool = True


class ScheduleEntry(SQLModel, table=True):
    __tablename__ = "schedule_entries"

    id: Optional[str] = Field(default_factory=_uuid, primary_key=True)
    store_id: str = Field(foreign_key="stores.id")
    staff_id: str = Field(foreign_key="staff.id")
    staff_name: str
    date: date
    shift: str                       # morning | afternoon | evening
    role: str
    generated_at: datetime = Field(default_factory=_now)


# ── Phase 2, Step 2.1 — Forecast ────────────────────────────────────────────

class Forecast(SQLModel, table=True):
    __tablename__ = "forecasts"

    id:             Optional[str]  = Field(default_factory=_uuid, primary_key=True)
    store_id:       str            = Field(foreign_key="stores.id")
    metric:         str                        # electricity | water | footfall | sales
    horizon_start:  datetime
    horizon_end:    datetime
    granularity:    str            = "daily"   # daily | hourly
    points:         str                        # JSON array of {ts, predicted, lower, upper}
    model:          str                        # holt_winters | seasonal_naive | linear
    generated_at:   datetime       = Field(default_factory=_now)


# ── Phase 2, Step 2.2 — Anomaly Events ──────────────────────────────────────

class AnomalyEvent(SQLModel, table=True):
    __tablename__ = "anomaly_events"

    id:          Optional[str]  = Field(default_factory=_uuid, primary_key=True)
    store_id:    str            = Field(foreign_key="stores.id")
    metric:      str                        # electricity | water | footfall | sales | inventory
    zone:        Optional[str]  = None
    value:       float
    z_score:     float
    severity:    str                        # HIGH | MEDIUM | LOW
    description: str
    ts:          datetime       = Field(default_factory=_now)
    resolved:    bool           = False


# ── Phase 2, Step 2.3 — Waste Events ────────────────────────────────────────

class WasteEvent(SQLModel, table=True):
    __tablename__ = "waste_events"

    id:             Optional[str]   = Field(default_factory=_uuid, primary_key=True)
    store_id:       str             = Field(foreign_key="stores.id")
    category:       str             # energy_idle | water_leak | stock_spoilage | overstock | overstaffing
    zone:           Optional[str]   = None
    start_time:     datetime
    end_time:       Optional[datetime] = None
    duration_hours: Optional[float] = None
    quantity:       Optional[float] = None
    cost_myr:       float
    co2e_kg:        Optional[float] = None
    action:         str
    anomaly_id:     Optional[str]   = None  # soft ref — no FK to avoid circular deps
    created_at:     datetime        = Field(default_factory=_now)


# ── Phase 2 / Phase 3 — Recommendations ─────────────────────────────────────

class Recommendation(SQLModel, table=True):
    __tablename__ = "recommendations"

    id:          Optional[str]  = Field(default_factory=_uuid, primary_key=True)
    store_id:    str            = Field(foreign_key="stores.id")
    category:    str            # energy | water | inventory | labor | sustainability
    title:       str
    detail:      str
    impact_myr:  Optional[float] = None
    impact_co2e: Optional[float] = None
    confidence:  float           = 0.0
    status:      str             = "new"   # new | acted | dismissed
    created_at:  datetime        = Field(default_factory=_now)
