import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (Path.cwd().parent / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        cleaned = value.strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
            cleaned = cleaned[1:-1]
        values[key.strip()] = cleaned
    return values


def post(base_url: str, headers: dict[str, str], table: str, payload: dict):
    request = urllib.request.Request(
        f"{base_url}/rest/v1/{table}?select=*",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        data = json.loads(response.read().decode("utf-8"))
        return data[0] if isinstance(data, list) else data


def main() -> None:
    values = load_env()
    base_url = values["SUPABASE_URL"].rstrip("/")
    service_key = values["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    suffix = uuid.uuid4().hex[:6]
    org = post(base_url, headers, "organizations", {"name": f"Demo Transport Org {suffix}"})
    store = post(base_url, headers, "stores", {"org_id": org["id"], "name": f"Demo Store {suffix}", "location": "Kuala Lumpur"})
    warehouse = post(base_url, headers, "transportation_locations", {"org_id": org["id"], "store_id": store["id"], "name": "Central Warehouse", "location_type": "warehouse", "address": "No. 1 Logistics Park", "latitude": 3.139, "longitude": 101.6869})
    hub = post(base_url, headers, "transportation_locations", {"org_id": org["id"], "store_id": store["id"], "name": "North Distribution Hub", "location_type": "hub", "address": "North Industrial Zone", "latitude": 3.223, "longitude": 101.704})
    store_front = post(base_url, headers, "transportation_locations", {"org_id": org["id"], "store_id": store["id"], "name": "Demo Retail Store", "location_type": "store", "address": "Bukit Bintang", "latitude": 3.146, "longitude": 101.713})
    vehicle = post(base_url, headers, "fleet_vehicles", {"org_id": org["id"], "store_id": store["id"], "registration_no": f"WQ{suffix.upper()[:4]}", "label": "Demo Truck 01", "make": "Isuzu", "model": "N-Series", "vehicle_type": "truck", "fuel_type": "diesel", "capacity_kg": 1200, "capacity_m3": 12, "odometer_km": 28450, "assigned_driver": "Aiman"})
    route = post(base_url, headers, "transportation_routes", {"org_id": org["id"], "store_id": store["id"], "name": "Warehouse to Store Express", "origin_location_id": warehouse["id"], "destination_location_id": store_front["id"], "planned_distance_km": 18.4, "estimated_duration_minutes": 35})
    post(base_url, headers, "transportation_route_stops", {"org_id": org["id"], "store_id": store["id"], "route_id": route["id"], "location_id": warehouse["id"], "stop_order": 1})
    post(base_url, headers, "transportation_route_stops", {"org_id": org["id"], "store_id": store["id"], "route_id": route["id"], "location_id": hub["id"], "stop_order": 2})
    post(base_url, headers, "transportation_route_stops", {"org_id": org["id"], "store_id": store["id"], "route_id": route["id"], "location_id": store_front["id"], "stop_order": 3})
    shipment = post(base_url, headers, "shipments", {"org_id": org["id"], "store_id": store["id"], "shipment_ref": f"SHP-{suffix.upper()}", "route_id": route["id"], "vehicle_id": vehicle["id"], "origin_location_id": warehouse["id"], "destination_location_id": store_front["id"], "status": "in_transit", "cargo_description": "Mixed retail replenishment", "cargo_weight_kg": 420.5, "cargo_volume_m3": 4.8})
    post(base_url, headers, "shipment_location_events", {"org_id": org["id"], "store_id": store["id"], "shipment_id": shipment["id"], "vehicle_id": vehicle["id"], "location_id": hub["id"], "event_type": "checkpoint", "notes": "Arrived at distribution hub"})
    post(base_url, headers, "vehicle_fuel_logs", {"org_id": org["id"], "store_id": store["id"], "vehicle_id": vehicle["id"], "shipment_id": shipment["id"], "fuel_type": "diesel", "volume_liters": 48.2, "cost_myr": 120.5, "odometer_km": 28450, "location_id": warehouse["id"]})
    post(base_url, headers, "vehicle_telemetry", {"org_id": org["id"], "store_id": store["id"], "vehicle_id": vehicle["id"], "shipment_id": shipment["id"], "route_id": route["id"], "speed_kmh": 54.2, "distance_km": 9.7, "odometer_km": 28459.7, "latitude": 3.191, "longitude": 101.692, "extra": {"engine_temp_c": 86, "door_open": False}})
    post(base_url, headers, "vehicle_maintenance_events", {"org_id": org["id"], "store_id": store["id"], "vehicle_id": vehicle["id"], "event_date": "2026-06-20", "event_type": "inspection", "odometer_km": 28450, "cost_myr": 180.0, "notes": "Routine pre-dispatch inspection"})

    print(json.dumps({"organization_id": org["id"], "store_id": store["id"], "shipment_id": shipment["id"], "vehicle_id": vehicle["id"]}, indent=2))


if __name__ == "__main__":
    main()
