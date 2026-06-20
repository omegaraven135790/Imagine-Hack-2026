from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import (
    FuelType,
    FuelLog,
    Route,
    RouteStop,
    Shipment,
    ShipmentLocationEvent,
    ShipmentStatus,
    TransportationLocation,
    Vehicle,
    VehicleMaintenanceEvent,
    VehicleTelemetry,
    VehicleStatus,
)
from tenancy import TenantScope, get_tenant_scope


router = APIRouter(prefix="/transportation", tags=["transportation"])


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
