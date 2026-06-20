create extension if not exists "pgcrypto";

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.stores (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    location text,
    floor_area_sqm numeric,
    max_occupancy integer,
    open_hour integer,
    close_hour integer,
    timezone text not null default 'Asia/Kuala_Lumpur',
    created_at timestamptz not null default now()
);

create table if not exists public.memberships (
    user_id uuid not null references auth.users(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    role text not null check (role in ('owner', 'manager', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (user_id, org_id)
);

create table if not exists public.transportation_locations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    name text not null,
    location_type text not null,
    address text,
    latitude double precision,
    longitude double precision,
    created_at timestamptz not null default now()
);

create table if not exists public.fleet_vehicles (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    registration_no text not null,
    label text not null,
    make text,
    model text,
    vehicle_type text not null,
    fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'hybrid', 'electric')),
    capacity_kg numeric,
    capacity_m3 numeric,
    odometer_km numeric not null default 0,
    status text not null default 'active' check (status in ('active', 'maintenance', 'inactive')),
    assigned_driver text,
    created_at timestamptz not null default now(),
    unique (org_id, registration_no)
);

create table if not exists public.transportation_routes (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    name text not null,
    origin_location_id uuid not null references public.transportation_locations(id),
    destination_location_id uuid not null references public.transportation_locations(id),
    planned_distance_km numeric not null check (planned_distance_km >= 0),
    estimated_duration_minutes integer,
    created_at timestamptz not null default now()
);

create table if not exists public.transportation_route_stops (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    route_id uuid not null references public.transportation_routes(id) on delete cascade,
    location_id uuid not null references public.transportation_locations(id),
    stop_order integer not null check (stop_order >= 0),
    planned_arrival timestamptz,
    created_at timestamptz not null default now(),
    unique (route_id, stop_order)
);

create table if not exists public.shipments (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    shipment_ref text not null,
    route_id uuid references public.transportation_routes(id),
    vehicle_id uuid references public.fleet_vehicles(id),
    origin_location_id uuid not null references public.transportation_locations(id),
    destination_location_id uuid not null references public.transportation_locations(id),
    status text not null default 'planned' check (status in ('planned', 'in_transit', 'delivered', 'delayed', 'cancelled')),
    cargo_description text,
    cargo_weight_kg numeric,
    cargo_volume_m3 numeric,
    scheduled_departure timestamptz,
    scheduled_arrival timestamptz,
    actual_departure timestamptz,
    actual_arrival timestamptz,
    created_at timestamptz not null default now(),
    unique (org_id, shipment_ref)
);

create table if not exists public.shipment_location_events (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    shipment_id uuid not null references public.shipments(id) on delete cascade,
    vehicle_id uuid references public.fleet_vehicles(id),
    location_id uuid references public.transportation_locations(id),
    latitude double precision,
    longitude double precision,
    event_type text not null,
    notes text,
    ts timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_logs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
    shipment_id uuid references public.shipments(id) on delete set null,
    fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'hybrid', 'electric')),
    volume_liters numeric not null check (volume_liters >= 0),
    cost_myr numeric check (cost_myr >= 0),
    odometer_km numeric,
    location_id uuid references public.transportation_locations(id),
    ts timestamptz not null default now()
);

create table if not exists public.vehicle_telemetry (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
    shipment_id uuid references public.shipments(id) on delete set null,
    route_id uuid references public.transportation_routes(id) on delete set null,
    speed_kmh numeric check (speed_kmh >= 0),
    distance_km numeric check (distance_km >= 0),
    odometer_km numeric,
    latitude double precision,
    longitude double precision,
    captured_at timestamptz not null default now(),
    extra jsonb
);

create table if not exists public.vehicle_maintenance_events (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
    event_date date not null,
    event_type text not null,
    odometer_km numeric,
    cost_myr numeric,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_stores_org on public.stores(org_id);
create index if not exists idx_transport_locations_store on public.transportation_locations(store_id);
create index if not exists idx_fleet_vehicles_store_status on public.fleet_vehicles(store_id, status);
create index if not exists idx_routes_store on public.transportation_routes(store_id);
create index if not exists idx_shipments_store_status on public.shipments(store_id, status);
create index if not exists idx_shipment_events_shipment_ts on public.shipment_location_events(shipment_id, ts desc);
create index if not exists idx_fuel_logs_vehicle_ts on public.vehicle_fuel_logs(vehicle_id, ts desc);
create index if not exists idx_telemetry_vehicle_ts on public.vehicle_telemetry(vehicle_id, captured_at desc);
create index if not exists idx_telemetry_shipment_ts on public.vehicle_telemetry(shipment_id, captured_at desc);
create index if not exists idx_maintenance_vehicle_date on public.vehicle_maintenance_events(vehicle_id, event_date desc);

alter table public.organizations enable row level security;
alter table public.stores enable row level security;
alter table public.memberships enable row level security;
alter table public.transportation_locations enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.transportation_routes enable row level security;
alter table public.transportation_route_stops enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_location_events enable row level security;
alter table public.vehicle_fuel_logs enable row level security;
alter table public.vehicle_telemetry enable row level security;
alter table public.vehicle_maintenance_events enable row level security;

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select org_id from public.memberships where user_id = auth.uid()
$$;

create or replace function public.current_user_can_manage_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.memberships
        where user_id = auth.uid()
          and org_id = target_org_id
          and role in ('owner', 'manager')
    )
$$;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'transportation_locations',
        'fleet_vehicles',
        'transportation_routes',
        'transportation_route_stops',
        'shipments',
        'shipment_location_events',
        'vehicle_fuel_logs',
        'vehicle_telemetry',
        'vehicle_maintenance_events'
    ]
    loop
        execute format('drop policy if exists "%s_select_by_org" on public.%I', table_name, table_name);
        execute format(
            'create policy "%s_select_by_org" on public.%I for select to authenticated using (org_id in (select public.current_user_org_ids()))',
            table_name,
            table_name
        );
        execute format('drop policy if exists "%s_write_by_org" on public.%I', table_name, table_name);
        execute format(
            'create policy "%s_write_by_org" on public.%I for all to authenticated using (public.current_user_can_manage_org(org_id)) with check (public.current_user_can_manage_org(org_id))',
            table_name,
            table_name
        );
    end loop;
end $$;

drop policy if exists "organizations_select_by_membership" on public.organizations;
create policy "organizations_select_by_membership"
on public.organizations
for select to authenticated
using (id in (select public.current_user_org_ids()));

drop policy if exists "stores_select_by_membership" on public.stores;
create policy "stores_select_by_membership"
on public.stores
for select to authenticated
using (org_id in (select public.current_user_org_ids()));

drop policy if exists "stores_write_by_org" on public.stores;
create policy "stores_write_by_org"
on public.stores
for all to authenticated
using (public.current_user_can_manage_org(org_id))
with check (public.current_user_can_manage_org(org_id));

drop policy if exists "memberships_select_self" on public.memberships;
create policy "memberships_select_self"
on public.memberships
for select to authenticated
using (user_id = auth.uid());

do $$
begin
    alter publication supabase_realtime add table public.shipments;
exception
    when duplicate_object then null;
    when undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.shipment_location_events;
exception
    when duplicate_object then null;
    when undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.vehicle_telemetry;
exception
    when duplicate_object then null;
    when undefined_object then null;
end $$;
