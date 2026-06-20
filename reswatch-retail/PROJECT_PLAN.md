# ResWatch Retail Transportation Addendum

This scaffold follows the architecture in the root `PROJECT_PLAN.md`: FastAPI, SQLModel,
Supabase Postgres, and org/store scoped data access.

The root plan explicitly marked transportation as out of scope for the indoor metrics
team. This addendum adds a separate transportation section without changing the indoor
module contract.

## Transportation Scope

- Fleet vehicle records, status, capacity, fuel type, odometer, and driver assignment.
- Transportation locations for stores, warehouses, customer destinations, depots, and stops.
- Routes and ordered route stops.
- Shipment records by origin, destination, route, vehicle, status, cargo, and schedule.
- Shipment location events for tracking by location and vehicle.
- Fuel logs for fuel tracking by vehicle, shipment, location, odometer, and cost.
- Vehicle telemetry for speed, distance traveled, odometer, GPS, route, and shipment.
- Maintenance events for fleet operational history.

## Supabase Setup

Apply `backend/migrations/20260620_transportation_schema.sql` to the Supabase Postgres
project. It creates all transportation tables, indexes, RLS select policies scoped through
`memberships`, org-scoped write policies for the transportation tables, and Realtime
publication entries for live shipment and telemetry updates.

## Backend API

The FastAPI router is mounted at `/api/transportation`.

Required request headers:

- `X-Org-Id`
- `X-Store-Id`

Initial endpoints include summary, locations, vehicles, routes, route stops, shipments,
shipment events, fuel logs, telemetry, and maintenance events.
