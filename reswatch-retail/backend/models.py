from datetime import date, datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class FuelType(str, Enum):
    petrol = "petrol"
    diesel = "diesel"
    hybrid = "hybrid"
    electric = "electric"


class VehicleStatus(str, Enum):
    active = "active"
    maintenance = "maintenance"
    inactive = "inactive"


class ShipmentStatus(str, Enum):
    planned = "planned"
    in_transit = "in_transit"
    delivered = "delivered"
    delayed = "delayed"
    cancelled = "cancelled"


class Organization(SQLModel, table=True):
    __tablename__ = "organizations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Store(SQLModel, table=True):
    __tablename__ = "stores"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(foreign_key="organizations.id", index=True)
    name: str
    location: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TransportationLocation(SQLModel, table=True):
    __tablename__ = "transportation_locations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    name: str
    location_type: str = Field(index=True)
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Vehicle(SQLModel, table=True):
    __tablename__ = "fleet_vehicles"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    registration_no: str = Field(index=True)
    label: str
    make: str | None = None
    model: str | None = None
    vehicle_type: str
    fuel_type: FuelType
    capacity_kg: float | None = None
    capacity_m3: float | None = None
    odometer_km: float = 0
    status: VehicleStatus = Field(default=VehicleStatus.active, index=True)
    assigned_driver: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Route(SQLModel, table=True):
    __tablename__ = "transportation_routes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    name: str
    origin_location_id: UUID = Field(foreign_key="transportation_locations.id", index=True)
    destination_location_id: UUID = Field(foreign_key="transportation_locations.id", index=True)
    planned_distance_km: float
    estimated_duration_minutes: int | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RouteStop(SQLModel, table=True):
    __tablename__ = "transportation_route_stops"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    route_id: UUID = Field(foreign_key="transportation_routes.id", index=True)
    location_id: UUID = Field(foreign_key="transportation_locations.id", index=True)
    stop_order: int
    planned_arrival: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Shipment(SQLModel, table=True):
    __tablename__ = "shipments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    shipment_ref: str = Field(index=True)
    route_id: UUID | None = Field(default=None, foreign_key="transportation_routes.id", index=True)
    vehicle_id: UUID | None = Field(default=None, foreign_key="fleet_vehicles.id", index=True)
    origin_location_id: UUID = Field(foreign_key="transportation_locations.id", index=True)
    destination_location_id: UUID = Field(foreign_key="transportation_locations.id", index=True)
    status: ShipmentStatus = Field(default=ShipmentStatus.planned, index=True)
    cargo_description: str | None = None
    cargo_weight_kg: float | None = None
    cargo_volume_m3: float | None = None
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    actual_departure: datetime | None = None
    actual_arrival: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShipmentLocationEvent(SQLModel, table=True):
    __tablename__ = "shipment_location_events"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    shipment_id: UUID = Field(foreign_key="shipments.id", index=True)
    vehicle_id: UUID | None = Field(default=None, foreign_key="fleet_vehicles.id", index=True)
    location_id: UUID | None = Field(default=None, foreign_key="transportation_locations.id", index=True)
    latitude: float | None = None
    longitude: float | None = None
    event_type: str = Field(index=True)
    notes: str | None = None
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)


class FuelLog(SQLModel, table=True):
    __tablename__ = "vehicle_fuel_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    vehicle_id: UUID = Field(foreign_key="fleet_vehicles.id", index=True)
    shipment_id: UUID | None = Field(default=None, foreign_key="shipments.id", index=True)
    fuel_type: FuelType
    volume_liters: float
    cost_myr: float | None = None
    odometer_km: float | None = None
    location_id: UUID | None = Field(default=None, foreign_key="transportation_locations.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)


class VehicleTelemetry(SQLModel, table=True):
    __tablename__ = "vehicle_telemetry"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    vehicle_id: UUID = Field(foreign_key="fleet_vehicles.id", index=True)
    shipment_id: UUID | None = Field(default=None, foreign_key="shipments.id", index=True)
    route_id: UUID | None = Field(default=None, foreign_key="transportation_routes.id", index=True)
    speed_kmh: float | None = None
    distance_km: float | None = None
    odometer_km: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    captured_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    extra: dict | None = Field(default=None, sa_column=Column(JSON))


class VehicleMaintenanceEvent(SQLModel, table=True):
    __tablename__ = "vehicle_maintenance_events"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    org_id: UUID = Field(index=True)
    store_id: UUID = Field(index=True)
    vehicle_id: UUID = Field(foreign_key="fleet_vehicles.id", index=True)
    event_date: date
    event_type: str
    odometer_km: float | None = None
    cost_myr: float | None = None
    notes: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
