from datetime import date, datetime, timedelta
from uuid import UUID
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import (
    Organization,
    FuelType,
    FuelLog,
    Route,
    RouteStop,
    Store,
    Shipment,
    ShipmentLocationEvent,
    ShipmentStatus,
    TransportationLocation,
    Vehicle,
    VehicleMaintenanceEvent,
    VehicleTelemetry,
    VehicleStatus,
)
from config import get_settings
from tenancy import TenantScope, get_tenant_scope


router = APIRouter(prefix="/transportation", tags=["transportation"])
settings = get_settings()


class TransportationSummary(BaseModel):
    active_vehicles: int
    shipments_in_transit: int
    shipments_delivered_today: int
    distance_km_24h: float
    fuel_liters_30d: float
    average_speed_kmh_24h: float | None


class LocationCreate(BaseModel):
    name: str
    location_type: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class VehicleCreate(BaseModel):
    registration_no: str
    label: str
    make: str | None = None
    model: str | None = None
    vehicle_type: str
    fuel_type: FuelType
    capacity_kg: float | None = None
    capacity_m3: float | None = None
    odometer_km: float = 0
    status: VehicleStatus = VehicleStatus.active
    assigned_driver: str | None = None


class RouteCreate(BaseModel):
    name: str
    origin_location_id: UUID
    destination_location_id: UUID
    planned_distance_km: float
    estimated_duration_minutes: int | None = None


class RouteStopCreate(BaseModel):
    location_id: UUID
    stop_order: int
    planned_arrival: datetime | None = None


class ShipmentCreate(BaseModel):
    shipment_ref: str
    route_id: UUID | None = None
    vehicle_id: UUID | None = None
    origin_location_id: UUID
    destination_location_id: UUID
    status: ShipmentStatus = ShipmentStatus.planned
    cargo_description: str | None = None
    cargo_weight_kg: float | None = None
    cargo_volume_m3: float | None = None
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    actual_departure: datetime | None = None
    actual_arrival: datetime | None = None


class ShipmentLocationEventCreate(BaseModel):
    vehicle_id: UUID | None = None
    location_id: UUID | None = None
    latitude: float | None = None
    longitude: float | None = None
    event_type: str
    notes: str | None = None
    ts: datetime | None = None


class FuelLogCreate(BaseModel):
    vehicle_id: UUID
    shipment_id: UUID | None = None
    fuel_type: FuelType
    volume_liters: float
    cost_myr: float | None = None
    odometer_km: float | None = None
    location_id: UUID | None = None
    ts: datetime | None = None


class VehicleTelemetryCreate(BaseModel):
    vehicle_id: UUID
    shipment_id: UUID | None = None
    route_id: UUID | None = None
    speed_kmh: float | None = None
    distance_km: float | None = None
    odometer_km: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    captured_at: datetime | None = None
    extra: dict | None = None


class MaintenanceEventCreate(BaseModel):
    vehicle_id: UUID
    event_date: date
    event_type: str
    odometer_km: float | None = None
    cost_myr: float | None = None
    notes: str | None = None


class DashboardResponse(BaseModel):
    summary: TransportationSummary
    organization: Organization | None
    store: Store | None
    locations: list[TransportationLocation]
    vehicles: list[Vehicle]
    routes: list[Route]
    route_stops: list[RouteStop]
    shipments: list[Shipment]
    shipment_events: list[ShipmentLocationEvent]
    fuel_logs: list[FuelLog]
    telemetry: list[VehicleTelemetry]
    maintenance_events: list[VehicleMaintenanceEvent]


class DemoSeedResult(BaseModel):
    organization_id: UUID
    store_id: UUID
    organization_name: str
    store_name: str
    created_records: int


class DemoSeedRequest(BaseModel):
    organization_name: str | None = None
    store_name: str | None = None


def _rest_headers() -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase REST credentials are not configured.",
        )

    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _parse_rest_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _rest_get(table: str, filters: dict[str, str] | None = None, order: str | None = None) -> list[dict]:
    base_url = settings.supabase_url.rstrip("/")
    params: list[tuple[str, str]] = [("select", "*")]
    for key, value in (filters or {}).items():
        params.append((key, f"eq.{value}"))
    if order:
        params.append(("order", order))
    url = f"{base_url}/rest/v1/{table}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers=_rest_headers(), method="GET")
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def _rest_summary(rows: dict[str, list[dict]]) -> TransportationSummary:
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    month_ago = now - timedelta(days=30)

    active_vehicles = sum(1 for row in rows["vehicles"] if row.get("status") == VehicleStatus.active.value)
    shipments_in_transit = sum(1 for row in rows["shipments"] if row.get("status") == ShipmentStatus.in_transit.value)
    shipments_delivered_today = 0
    for row in rows["shipments"]:
        if row.get("status") != ShipmentStatus.delivered.value:
            continue
        arrived = _parse_rest_datetime(row.get("actual_arrival"))
        if arrived and arrived.date() == now.date():
            shipments_delivered_today += 1

    distance_km_24h = sum(
        float(row.get("distance_km") or 0)
        for row in rows["telemetry"]
        if (captured_at := _parse_rest_datetime(row.get("captured_at"))) and captured_at >= day_ago
    )
    fuel_liters_30d = sum(
        float(row.get("volume_liters") or 0)
        for row in rows["fuel_logs"]
        if (ts := _parse_rest_datetime(row.get("ts"))) and ts >= month_ago
    )
    speeds = [
        float(row.get("speed_kmh"))
        for row in rows["telemetry"]
        if row.get("speed_kmh") is not None and (captured_at := _parse_rest_datetime(row.get("captured_at"))) and captured_at >= day_ago
    ]
    average_speed_kmh_24h = sum(speeds) / len(speeds) if speeds else None

    return TransportationSummary(
        active_vehicles=active_vehicles,
        shipments_in_transit=shipments_in_transit,
        shipments_delivered_today=shipments_delivered_today,
        distance_km_24h=float(distance_km_24h),
        fuel_liters_30d=float(fuel_liters_30d),
        average_speed_kmh_24h=average_speed_kmh_24h,
    )


def make_dashboard_html() -> str:
        return """<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>ResWatch Transportation Demo</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f4efe6;
            --panel: rgba(255, 255, 255, 0.86);
            --ink: #132238;
            --muted: #5b6575;
            --accent: #0f766e;
            --accent-2: #b45309;
            --border: rgba(19, 34, 56, 0.12);
            --shadow: 0 18px 40px rgba(19, 34, 56, 0.12);
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;
            background:
                radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 35%),
                radial-gradient(circle at top right, rgba(180, 83, 9, 0.16), transparent 30%),
                linear-gradient(180deg, #faf7f1 0%, #f1eadf 100%);
            color: var(--ink);
        }
        .wrap { max-width: 1400px; margin: 0 auto; padding: 28px; }
        .hero {
            display: grid;
            grid-template-columns: 1.6fr 1fr;
            gap: 20px;
            align-items: stretch;
            margin-bottom: 20px;
        }
        .panel {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 22px;
            box-shadow: var(--shadow);
            backdrop-filter: blur(10px);
        }
        .hero-copy { padding: 28px; position: relative; overflow: hidden; }
        .hero-copy::after {
            content: \"\";
            position: absolute;
            inset: auto -40px -40px auto;
            width: 180px;
            height: 180px;
            border-radius: 50%;
            background: rgba(15, 118, 110, 0.08);
        }
        .eyebrow { text-transform: uppercase; letter-spacing: .16em; font-size: 12px; color: var(--accent-2); font-weight: 700; }
        h1 { margin: 12px 0 10px; font-size: clamp(34px, 5vw, 58px); line-height: 0.98; }
        p { color: var(--muted); line-height: 1.55; }
        .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
        button {
            border: 0;
            border-radius: 999px;
            padding: 12px 18px;
            font-weight: 700;
            cursor: pointer;
        }
        .primary { background: var(--ink); color: white; }
        .secondary { background: rgba(15, 118, 110, 0.12); color: var(--accent); }
        .meta { display: grid; gap: 10px; padding: 22px; }
        .meta input {
            width: 100%;
            border-radius: 14px;
            border: 1px solid var(--border);
            padding: 12px 14px;
            background: white;
            color: var(--ink);
        }
        .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
        .stat { padding: 18px; }
        .stat .label { color: var(--muted); font-size: 13px; }
        .stat .value { font-size: 28px; font-weight: 800; margin-top: 8px; }
        .grid { display: grid; gap: 16px; }
        .cards { grid-template-columns: 1fr 1fr; }
        .section { padding: 20px; }
        .section h2 { margin: 0 0 8px; font-size: 20px; }
        .table-wrap { overflow: auto; border-radius: 16px; border: 1px solid var(--border); }
        table { width: 100%; border-collapse: collapse; font-size: 14px; background: white; }
        th, td { padding: 10px 12px; border-bottom: 1px solid rgba(19, 34, 56, 0.08); text-align: left; vertical-align: top; }
        th { position: sticky; top: 0; background: #f8fafc; z-index: 1; }
        .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: rgba(15, 118, 110, 0.12); color: var(--accent); font-size: 12px; font-weight: 700; }
        pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
        .status { margin-top: 10px; color: var(--muted); font-size: 14px; }
        @media (max-width: 980px) { .hero, .stats, .cards { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class=\"wrap\">
        <div class=\"hero\">
            <div class=\"panel hero-copy\">
                <div class=\"eyebrow\">ResWatch Transportation</div>
                <h1>Simple demo dashboard for Supabase transportation data.</h1>
                <p>Seed a fresh demo tenant, then inspect locations, vehicles, routes, shipments, telemetry, fuel logs, and maintenance events from one page.</p>
                <div class=\"actions\">
                    <button class=\"primary\" id=\"seedBtn\">Seed demo data</button>
                    <button class=\"secondary\" id=\"refreshBtn\">Refresh data</button>
                </div>
                <div class=\"status\" id=\"status\">Ready. Seed data to start.</div>
            </div>
            <div class=\"panel meta\">
                <label>
                    <div class=\"eyebrow\" style=\"margin-bottom:8px;\">Organization ID</div>
                    <input id=\"orgId\" placeholder=\"Paste seeded org id\" />
                </label>
                <label>
                    <div class=\"eyebrow\" style=\"margin-bottom:8px;\">Store ID</div>
                    <input id=\"storeId\" placeholder=\"Paste seeded store id\" />
                </label>
                <div><span class=\"pill\" id=\"connectionState\">No tenant selected</span></div>
                <p style=\"margin:0;\">The dashboard uses <code>X-Org-Id</code> and <code>X-Store-Id</code> headers against the API so you can inspect any seeded tenant.</p>
            </div>
        </div>

        <div class=\"stats\" id=\"stats\"></div>

        <div class=\"grid cards\">
            <div class=\"panel section\">
                <h2>Locations</h2>
                <div class=\"table-wrap\"><table id=\"locationsTable\"></table></div>
            </div>
            <div class=\"panel section\">
                <h2>Vehicles</h2>
                <div class=\"table-wrap\"><table id=\"vehiclesTable\"></table></div>
            </div>
            <div class=\"panel section\">
                <h2>Routes</h2>
                <div class=\"table-wrap\"><table id=\"routesTable\"></table></div>
            </div>
            <div class=\"panel section\">
                <h2>Shipments</h2>
                <div class=\"table-wrap\"><table id=\"shipmentsTable\"></table></div>
            </div>
            <div class=\"panel section\">
                <h2>Telemetry</h2>
                <div class=\"table-wrap\"><table id=\"telemetryTable\"></table></div>
            </div>
            <div class=\"panel section\">
                <h2>Fuel & Maintenance</h2>
                <div class=\"table-wrap\"><table id=\"opsTable\"></table></div>
            </div>
        </div>
    </div>

    <script>
        const state = { data: null };
        const fields = ['orgId', 'storeId'];

        function saveIds() {
            fields.forEach((id) => localStorage.setItem(id, document.getElementById(id).value.trim()));
            updateConnectionState();
        }

        function loadIds() {
            fields.forEach((id) => document.getElementById(id).value = localStorage.getItem(id) || '');
            updateConnectionState();
        }

        function updateConnectionState() {
            const orgId = document.getElementById('orgId').value.trim();
            const storeId = document.getElementById('storeId').value.trim();
            const pill = document.getElementById('connectionState');
            if (orgId && storeId) {
                pill.textContent = 'Tenant ready';
            } else {
                pill.textContent = 'No tenant selected';
            }
        }

        function headers() {
            const orgId = document.getElementById('orgId').value.trim();
            const storeId = document.getElementById('storeId').value.trim();
            const out = {'Content-Type': 'application/json'};
            if (orgId) out['X-Org-Id'] = orgId;
            if (storeId) out['X-Store-Id'] = storeId;
            return out;
        }

        function esc(value) {
            return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        }

        function renderStats(summary) {
            const stats = [
                ['Active vehicles', summary.active_vehicles],
                ['In transit', summary.shipments_in_transit],
                ['Delivered today', summary.shipments_delivered_today],
                ['Distance 24h (km)', summary.distance_km_24h.toFixed(1)],
                ['Fuel 30d (L)', summary.fuel_liters_30d.toFixed(1)],
                ['Avg speed 24h', summary.average_speed_kmh_24h == null ? 'n/a' : summary.average_speed_kmh_24h.toFixed(1)],
            ];
            document.getElementById('stats').innerHTML = stats.map(([label, value]) => `
                <div class=\"panel stat\"><div class=\"label\">${esc(label)}</div><div class=\"value\">${esc(value)}</div></div>
            `).join('');
        }

        function renderTable(tableId, rows, columns) {
            const table = document.getElementById(tableId);
            if (!rows.length) {
                table.innerHTML = '<thead><tr><th>Empty</th></tr></thead><tbody><tr><td>No rows</td></tr></tbody>';
                return;
            }
            table.innerHTML = `
                <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.map((row) => `<tr>${columns.map((c) => `<td>${esc(c.value(row))}</td>`).join('')}</tr>`).join('')}
                </tbody>
            `;
        }

        function renderDashboard(data) {
            state.data = data;
            renderStats(data.summary);
            renderTable('locationsTable', data.locations, [
                { label: 'Name', value: (r) => r.name },
                { label: 'Type', value: (r) => r.location_type },
                { label: 'Address', value: (r) => r.address || '' },
                { label: 'Coords', value: (r) => [r.latitude, r.longitude].filter(Boolean).join(', ') },
            ]);
            renderTable('vehiclesTable', data.vehicles, [
                { label: 'Label', value: (r) => r.label },
                { label: 'Reg No', value: (r) => r.registration_no },
                { label: 'Type', value: (r) => r.vehicle_type },
                { label: 'Fuel', value: (r) => r.fuel_type },
                { label: 'Status', value: (r) => r.status },
            ]);
            renderTable('routesTable', data.routes, [
                { label: 'Name', value: (r) => r.name },
                { label: 'Distance', value: (r) => r.planned_distance_km },
                { label: 'Duration', value: (r) => r.estimated_duration_minutes || '' },
            ]);
            renderTable('shipmentsTable', data.shipments, [
                { label: 'Ref', value: (r) => r.shipment_ref },
                { label: 'Status', value: (r) => r.status },
                { label: 'Vehicle', value: (r) => r.vehicle_id || '' },
                { label: 'Cargo', value: (r) => r.cargo_description || '' },
            ]);
            renderTable('telemetryTable', data.telemetry, [
                { label: 'Vehicle', value: (r) => r.vehicle_id },
                { label: 'Speed', value: (r) => r.speed_kmh || '' },
                { label: 'Distance', value: (r) => r.distance_km || '' },
                { label: 'Captured', value: (r) => r.captured_at },
            ]);
            renderTable('opsTable', [...data.fuel_logs, ...data.maintenance_events], [
                { label: 'Type', value: (r) => r.volume_liters != null ? 'Fuel' : 'Maintenance' },
                { label: 'Ref', value: (r) => r.vehicle_id },
                { label: 'Detail', value: (r) => r.volume_liters != null ? `${r.volume_liters} L` : r.event_type },
                { label: 'When', value: (r) => r.ts || r.event_date || '' },
            ]);
            document.getElementById('status').textContent = `Loaded ${data.shipments.length} shipments, ${data.vehicles.length} vehicles, and ${data.locations.length} locations.`;
        }

        async function loadDashboard() {
            saveIds();
            const orgId = document.getElementById('orgId').value.trim();
            const storeId = document.getElementById('storeId').value.trim();
            if (!orgId || !storeId) {
                document.getElementById('status').textContent = 'Seed data first, then refresh with the returned IDs.';
                return;
            }
            document.getElementById('status').textContent = 'Loading...';
            const response = await fetch('/api/transportation/dashboard', { headers: headers() });
            if (!response.ok) throw new Error(await response.text());
            renderDashboard(await response.json());
        }

        async function seedDemo() {
            document.getElementById('status').textContent = 'Seeding demo data...';
            const response = await fetch('/api/transportation/demo/seed', { method: 'POST', headers: headers(), body: JSON.stringify({}) });
            if (!response.ok) throw new Error(await response.text());
            const seed = await response.json();
            document.getElementById('orgId').value = seed.organization_id;
            document.getElementById('storeId').value = seed.store_id;
            saveIds();
            await loadDashboard();
        }

        document.getElementById('orgId').addEventListener('input', saveIds);
        document.getElementById('storeId').addEventListener('input', saveIds);
        document.getElementById('refreshBtn').addEventListener('click', () => loadDashboard().catch((error) => document.getElementById('status').textContent = error.message));
        document.getElementById('seedBtn').addEventListener('click', () => seedDemo().catch((error) => document.getElementById('status').textContent = error.message));
        loadIds();
    </script>
</body>
</html>"""


def fetch_dashboard_data(scope: TenantScope) -> DashboardResponse:
    rows = {
        "organization": _rest_get("organizations", {"id": str(scope.org_id)}),
        "store": _rest_get("stores", {"id": str(scope.store_id), "org_id": str(scope.org_id)}),
        "locations": _rest_get("transportation_locations", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "created_at.desc"),
        "vehicles": _rest_get("fleet_vehicles", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "label.asc"),
        "routes": _rest_get("transportation_routes", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "name.asc"),
        "route_stops": _rest_get("transportation_route_stops", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "stop_order.asc"),
        "shipments": _rest_get("shipments", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "created_at.desc"),
        "shipment_events": _rest_get("shipment_location_events", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "ts.desc"),
        "fuel_logs": _rest_get("vehicle_fuel_logs", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "ts.desc"),
        "telemetry": _rest_get("vehicle_telemetry", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "captured_at.desc"),
        "maintenance_events": _rest_get("vehicle_maintenance_events", {"org_id": str(scope.org_id), "store_id": str(scope.store_id)}, "created_at.desc"),
    }

    return DashboardResponse(
        summary=_rest_summary(rows),
        organization=rows["organization"][0] if rows["organization"] else None,
        store=rows["store"][0] if rows["store"] else None,
        locations=rows["locations"],
        vehicles=rows["vehicles"],
        routes=rows["routes"],
        route_stops=rows["route_stops"],
        shipments=rows["shipments"],
        shipment_events=rows["shipment_events"],
        fuel_logs=rows["fuel_logs"],
        telemetry=rows["telemetry"],
        maintenance_events=rows["maintenance_events"],
    )


def scoped(statement, model, scope: TenantScope):
    return statement.where(model.org_id == scope.org_id, model.store_id == scope.store_id)


def get_scoped_or_404(session: Session, model, entity_id: UUID, scope: TenantScope):
    entity = session.exec(scoped(select(model).where(model.id == entity_id), model, scope)).first()
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{model.__name__} not found")
    return entity


@router.get("/summary", response_model=TransportationSummary)
def get_summary(
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
) -> TransportationSummary:
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    month_ago = now - timedelta(days=30)

    active_vehicles = session.exec(
        scoped(select(func.count()).select_from(Vehicle).where(Vehicle.status == VehicleStatus.active), Vehicle, scope)
    ).one()
    shipments_in_transit = session.exec(
        scoped(
            select(func.count()).select_from(Shipment).where(Shipment.status == ShipmentStatus.in_transit),
            Shipment,
            scope,
        )
    ).one()
    shipments_delivered_today = session.exec(
        scoped(
            select(func.count()).select_from(Shipment).where(
                Shipment.status == ShipmentStatus.delivered,
                Shipment.actual_arrival >= now.replace(hour=0, minute=0, second=0, microsecond=0),
            ),
            Shipment,
            scope,
        )
    ).one()
    distance_km_24h = session.exec(
        scoped(
            select(func.coalesce(func.sum(VehicleTelemetry.distance_km), 0)).where(
                VehicleTelemetry.captured_at >= day_ago
            ),
            VehicleTelemetry,
            scope,
        )
    ).one()
    fuel_liters_30d = session.exec(
        scoped(
            select(func.coalesce(func.sum(FuelLog.volume_liters), 0)).where(FuelLog.ts >= month_ago),
            FuelLog,
            scope,
        )
    ).one()
    average_speed_kmh_24h = session.exec(
        scoped(
            select(func.avg(VehicleTelemetry.speed_kmh)).where(VehicleTelemetry.captured_at >= day_ago),
            VehicleTelemetry,
            scope,
        )
    ).one()

    return TransportationSummary(
        active_vehicles=active_vehicles,
        shipments_in_transit=shipments_in_transit,
        shipments_delivered_today=shipments_delivered_today,
        distance_km_24h=float(distance_km_24h or 0),
        fuel_liters_30d=float(fuel_liters_30d or 0),
        average_speed_kmh_24h=float(average_speed_kmh_24h) if average_speed_kmh_24h is not None else None,
    )


@router.get("/locations", response_model=list[TransportationLocation])
def list_locations(scope: TenantScope = Depends(get_tenant_scope), session: Session = Depends(get_session)):
    return session.exec(scoped(select(TransportationLocation), TransportationLocation, scope)).all()


@router.post("/locations", response_model=TransportationLocation, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    location = TransportationLocation(**payload.model_dump(), org_id=scope.org_id, store_id=scope.store_id)
    session.add(location)
    session.commit()
    session.refresh(location)
    return location


@router.get("/vehicles", response_model=list[Vehicle])
def list_vehicles(scope: TenantScope = Depends(get_tenant_scope), session: Session = Depends(get_session)):
    return session.exec(scoped(select(Vehicle).order_by(Vehicle.label), Vehicle, scope)).all()


@router.post("/vehicles", response_model=Vehicle, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    vehicle = Vehicle(**payload.model_dump(), org_id=scope.org_id, store_id=scope.store_id)
    session.add(vehicle)
    session.commit()
    session.refresh(vehicle)
    return vehicle


@router.get("/routes", response_model=list[Route])
def list_routes(scope: TenantScope = Depends(get_tenant_scope), session: Session = Depends(get_session)):
    return session.exec(scoped(select(Route).order_by(Route.name), Route, scope)).all()


@router.post("/routes", response_model=Route, status_code=status.HTTP_201_CREATED)
def create_route(
    payload: RouteCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, TransportationLocation, payload.origin_location_id, scope)
    get_scoped_or_404(session, TransportationLocation, payload.destination_location_id, scope)
    route = Route(**payload.model_dump(), org_id=scope.org_id, store_id=scope.store_id)
    session.add(route)
    session.commit()
    session.refresh(route)
    return route


@router.post("/routes/{route_id}/stops", response_model=RouteStop, status_code=status.HTTP_201_CREATED)
def add_route_stop(
    route_id: UUID,
    payload: RouteStopCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, Route, route_id, scope)
    get_scoped_or_404(session, TransportationLocation, payload.location_id, scope)
    route_stop = RouteStop(**payload.model_dump(), route_id=route_id, org_id=scope.org_id, store_id=scope.store_id)
    session.add(route_stop)
    session.commit()
    session.refresh(route_stop)
    return route_stop


@router.get("/shipments", response_model=list[Shipment])
def list_shipments(scope: TenantScope = Depends(get_tenant_scope), session: Session = Depends(get_session)):
    return session.exec(scoped(select(Shipment).order_by(Shipment.created_at.desc()), Shipment, scope)).all()


@router.post("/shipments", response_model=Shipment, status_code=status.HTTP_201_CREATED)
def create_shipment(
    payload: ShipmentCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, TransportationLocation, payload.origin_location_id, scope)
    get_scoped_or_404(session, TransportationLocation, payload.destination_location_id, scope)
    if payload.route_id:
        get_scoped_or_404(session, Route, payload.route_id, scope)
    if payload.vehicle_id:
        get_scoped_or_404(session, Vehicle, payload.vehicle_id, scope)
    shipment = Shipment(**payload.model_dump(), org_id=scope.org_id, store_id=scope.store_id)
    session.add(shipment)
    session.commit()
    session.refresh(shipment)
    return shipment


@router.post("/shipments/{shipment_id}/events", response_model=ShipmentLocationEvent, status_code=status.HTTP_201_CREATED)
def record_shipment_event(
    shipment_id: UUID,
    payload: ShipmentLocationEventCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    shipment = get_scoped_or_404(session, Shipment, shipment_id, scope)
    event_data = payload.model_dump(exclude_none=True)
    event_vehicle_id = event_data.pop("vehicle_id", None) or shipment.vehicle_id
    event = ShipmentLocationEvent(
        **event_data,
        shipment_id=shipment.id,
        vehicle_id=event_vehicle_id,
        org_id=scope.org_id,
        store_id=scope.store_id,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@router.post("/fuel-logs", response_model=FuelLog, status_code=status.HTTP_201_CREATED)
def create_fuel_log(
    payload: FuelLogCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, Vehicle, payload.vehicle_id, scope)
    fuel_log = FuelLog(**payload.model_dump(exclude_none=True), org_id=scope.org_id, store_id=scope.store_id)
    session.add(fuel_log)
    session.commit()
    session.refresh(fuel_log)
    return fuel_log


@router.post("/telemetry", response_model=VehicleTelemetry, status_code=status.HTTP_201_CREATED)
def record_telemetry(
    payload: VehicleTelemetryCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, Vehicle, payload.vehicle_id, scope)
    telemetry = VehicleTelemetry(**payload.model_dump(exclude_none=True), org_id=scope.org_id, store_id=scope.store_id)
    session.add(telemetry)
    session.commit()
    session.refresh(telemetry)
    return telemetry


@router.get("/vehicles/{vehicle_id}/telemetry", response_model=list[VehicleTelemetry])
def list_vehicle_telemetry(
    vehicle_id: UUID,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, Vehicle, vehicle_id, scope)
    return session.exec(
        scoped(
            select(VehicleTelemetry)
            .where(VehicleTelemetry.vehicle_id == vehicle_id)
            .order_by(VehicleTelemetry.captured_at.desc()),
            VehicleTelemetry,
            scope,
        )
    ).all()


@router.post("/maintenance", response_model=VehicleMaintenanceEvent, status_code=status.HTTP_201_CREATED)
def create_maintenance_event(
    payload: MaintenanceEventCreate,
    scope: TenantScope = Depends(get_tenant_scope),
    session: Session = Depends(get_session),
):
    get_scoped_or_404(session, Vehicle, payload.vehicle_id, scope)
    maintenance = VehicleMaintenanceEvent(**payload.model_dump(), org_id=scope.org_id, store_id=scope.store_id)
    session.add(maintenance)
    session.commit()
    session.refresh(maintenance)
    return maintenance


@router.get("/dashboard")
def get_dashboard(
    scope: TenantScope = Depends(get_tenant_scope),
) -> dict:
    return fetch_dashboard_data(scope).model_dump(mode="json")


@router.post("/demo/seed", response_model=DemoSeedResult, status_code=status.HTTP_201_CREATED)
def seed_demo_data(
    payload: DemoSeedRequest | None = None,
    session: Session = Depends(get_session),
) -> DemoSeedResult:
    suffix = datetime.utcnow().strftime("%H%M%S")
    organization_name = payload.organization_name if payload and payload.organization_name else f"Demo Transport Org {suffix}"
    store_name = payload.store_name if payload and payload.store_name else f"Demo Store {suffix}"

    org = Organization(name=organization_name)
    session.add(org)
    session.flush()

    store = Store(org_id=org.id, name=store_name, location="Kuala Lumpur")
    session.add(store)
    session.flush()

    warehouse = TransportationLocation(
        org_id=org.id,
        store_id=store.id,
        name="Central Warehouse",
        location_type="warehouse",
        address="No. 1 Logistics Park",
        latitude=3.139,
        longitude=101.6869,
    )
    hub = TransportationLocation(
        org_id=org.id,
        store_id=store.id,
        name="North Distribution Hub",
        location_type="hub",
        address="North Industrial Zone",
        latitude=3.223,
        longitude=101.704,
    )
    store_front = TransportationLocation(
        org_id=org.id,
        store_id=store.id,
        name="Demo Retail Store",
        location_type="store",
        address="Bukit Bintang",
        latitude=3.146,
        longitude=101.713,
    )
    session.add_all([warehouse, hub, store_front])
    session.flush()

    vehicle = Vehicle(
        org_id=org.id,
        store_id=store.id,
        registration_no=f"WQ{suffix[-4:]}",
        label="Demo Truck 01",
        make="Isuzu",
        model="N-Series",
        vehicle_type="truck",
        fuel_type=FuelType.diesel,
        capacity_kg=1200,
        capacity_m3=12,
        odometer_km=28450,
        assigned_driver="Aiman",
    )
    session.add(vehicle)
    session.flush()

    route = Route(
        org_id=org.id,
        store_id=store.id,
        name="Warehouse to Store Express",
        origin_location_id=warehouse.id,
        destination_location_id=store_front.id,
        planned_distance_km=18.4,
        estimated_duration_minutes=35,
    )
    session.add(route)
    session.flush()

    session.add_all([
        RouteStop(org_id=org.id, store_id=store.id, route_id=route.id, location_id=warehouse.id, stop_order=1),
        RouteStop(org_id=org.id, store_id=store.id, route_id=route.id, location_id=hub.id, stop_order=2),
        RouteStop(org_id=org.id, store_id=store.id, route_id=route.id, location_id=store_front.id, stop_order=3),
    ])
    session.flush()

    shipment = Shipment(
        org_id=org.id,
        store_id=store.id,
        shipment_ref=f"SHP-{suffix}",
        route_id=route.id,
        vehicle_id=vehicle.id,
        origin_location_id=warehouse.id,
        destination_location_id=store_front.id,
        status=ShipmentStatus.in_transit,
        cargo_description="Mixed retail replenishment",
        cargo_weight_kg=420.5,
        cargo_volume_m3=4.8,
        scheduled_departure=datetime.utcnow(),
    )
    session.add(shipment)
    session.flush()

    event = ShipmentLocationEvent(
        org_id=org.id,
        store_id=store.id,
        shipment_id=shipment.id,
        vehicle_id=vehicle.id,
        location_id=hub.id,
        event_type="checkpoint",
        notes="Arrived at distribution hub",
    )
    fuel_log = FuelLog(
        org_id=org.id,
        store_id=store.id,
        vehicle_id=vehicle.id,
        shipment_id=shipment.id,
        fuel_type=FuelType.diesel,
        volume_liters=48.2,
        cost_myr=120.5,
        odometer_km=28450,
        location_id=warehouse.id,
    )
    telemetry = VehicleTelemetry(
        org_id=org.id,
        store_id=store.id,
        vehicle_id=vehicle.id,
        shipment_id=shipment.id,
        route_id=route.id,
        speed_kmh=54.2,
        distance_km=9.7,
        odometer_km=28459.7,
        latitude=3.191,
        longitude=101.692,
        extra={"engine_temp_c": 86, "door_open": False},
    )
    maintenance = VehicleMaintenanceEvent(
        org_id=org.id,
        store_id=store.id,
        vehicle_id=vehicle.id,
        event_date=date.today(),
        event_type="inspection",
        odometer_km=28450,
        cost_myr=180.0,
        notes="Routine pre-dispatch inspection",
    )
    session.add_all([event, fuel_log, telemetry, maintenance])
    session.commit()

    return DemoSeedResult(
        organization_id=org.id,
        store_id=store.id,
        organization_name=org.name,
        store_name=store.name,
        created_records=11,
    )


@router.get("/demo-ui", response_class=HTMLResponse)
def transportation_demo_ui() -> HTMLResponse:
    return HTMLResponse(make_dashboard_html())
