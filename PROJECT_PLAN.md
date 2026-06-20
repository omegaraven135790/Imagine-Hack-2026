# ResWatch (Retail SME Overhaul) — Master Plan

> This document is the systematic build plan for the overhauled ResWatch. After approval it will be copied into the new project directory as `PROJECT_PLAN.md` and serve as the source of truth. Features are defined one-by-one (see §7) and built one-by-one (see §10).

---

## 1. Context

The original ResWatch (`C:\Users\Drew\Imaginehack_2026\reswatch\`) is a working facilities-management dashboard for a campus building (electricity / water / occupancy + anomaly detection, waste cost, OR-Tools staff scheduling, PDF reports). It is complete and runs via `docker compose up`.

We are **pivoting it to retail/sales SMEs** and rebuilding it as a **shipping-ready** product, in a **new separate directory** so the original stays intact. The new app keeps the strongest parts of the old one (statistical anomaly detection, OR-Tools scheduling, ReportLab reports, Supabase + FastAPI + React stack) and adds the new retail domain, multi-store tenancy, and a **predictive insights** layer that drives optimization and recommendations.

**Why:** ImagineHack 2026, Track 3 (Double Dot — Smarter Resource Management). The team app covers retail/sales SMEs across electricity, water, transportation, materials, and manpower; **this section is the indoor metrics — electricity, water, inventory/materials, manpower, foot traffic, and sales — explicitly excluding transportation.**

**Intended outcome:** a live monitoring + dashboard system with predictive insights, optimization tools that cut unnecessary usage (cost + environmental), demand-driven smart manpower scheduling, and data-driven sustainability recommendations — multi-store ready, demo-clean, and deployable.

### Locked decisions (confirmed with Drew)
| Decision | Choice |
|---|---|
| Brand / directory | Keep **ResWatch**; new directory `reswatch-retail/` (sibling of `reswatch/`) |
| Metrics in scope | Electricity + Water · Inventory/Stock · Manpower · Foot Traffic · **Sales (first-class)** — no transportation |
| Predictions | **Lightweight statistical** (Holt-Winters / seasonal-naive / linear trend via `statsmodels`/`numpy`) |
| Supabase | **Fresh schema, multi-store ready** in existing project `uccwiuglffjrecsmbnwu` (drop old tables, org/store dimension, RLS) |

---

## 2. Vision & Goals

A facilities/operations dashboard for a retail SME owner or store manager. Five product pillars:

1. **Live Monitoring** — one dashboard across energy, water, inventory, footfall, sales, and staffing, updating in real time.
2. **Predictive Insights** — forecast demand (footfall/sales) and resource usage (energy/water/inventory), applied across every metric.
3. **Optimization** — detect and quantify unnecessary usage (idle energy, water leaks, stock spoilage/overstock, over/under-staffing) in RM and CO₂e, with concrete actions.
4. **Smart Manpower Scheduling** — staffing generated from *forecasted* footfall/sales/busyness, not a flat headcount.
5. **Sustainability Insights** — data-driven recommendations tying every saving to cost and carbon.

---

## 3. Tech Stack

Carried over from the old app unless noted. **Bold = new for this overhaul.**

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS (v3) + **centralized design tokens** (use the existing-but-unused `brand` palette properly) |
| Icons | **lucide-react** (replace emoji-as-icons) |
| Charts | Recharts |
| Data fetching | **TanStack Query (React Query)** — caching, refetch, dedup; removes hand-rolled `useState/useEffect` boilerplate |
| Toasts / Realtime | sonner + Supabase Realtime |
| Backend | FastAPI (Python 3.12) |
| ORM | SQLModel + SQLAlchemy 2.0 |
| DB / Auth / Realtime / Storage | Supabase (managed Postgres, Auth JWT, Realtime, Storage for PDFs) |
| DB driver | psycopg2-binary |
| **Forecasting** | **statsmodels (Holt-Winters / ETS) + numpy/pandas**; seasonal-naive & linear-trend fallbacks |
| Optimization | Google OR-Tools (CP-SAT) — retuned for demand-driven retail staffing |
| Anomaly detection | pandas (Z-score + IQR), generalized across metrics |
| PDF reports | ReportLab |
| Background jobs | **APScheduler** (nightly forecast refresh + waste recompute + **monthly tariff/AFA refresh**) — optional, on-demand fallback |
| **Live tariff data** | **httpx + BeautifulSoup** to fetch published TNB/Air Selangor rates incl. TNB **monthly AFA**; cached with config fallback (see §6.5). *(re-add `httpx`; add `beautifulsoup4`)* |
| Deployment | Docker Compose (backend + frontend); Supabase cloud. Frontend → Vercel, backend → Render for cloud demo |

### Dependency changes vs old app
- **Add:** `statsmodels`, `apscheduler`, `httpx`, `beautifulsoup4` (backend); `@tanstack/react-query`, `lucide-react`, `date-fns` (frontend).
- **Remove dead deps:** `scipy`; the unused `supabase` python lib *unless* we adopt Supabase Storage for PDFs (then keep it). (`httpx` is now used by the tariff service.)
- **Keep:** fastapi, uvicorn, sqlmodel, sqlalchemy, psycopg2-binary, pandas, ortools, reportlab, python-dotenv, pydantic-settings, pyjwt[crypto].

---

## 4. Architecture

### 4.1 Directory layout (`reswatch-retail/`)
```
reswatch-retail/
├── PROJECT_PLAN.md            # this document
├── docker-compose.yml         # carry DNS fix (dns: 8.8.8.8) + multi-store env
├── .env / .env.example
├── backend/
│   ├── main.py                # app wiring, CORS, lifespan, router registration
│   ├── config.py              # settings incl. tariffs, forecast horizon, store defaults
│   ├── database.py            # engine + session (reuse, keep SQLite fallback)
│   ├── auth.py                # JWKS JWT verify (reuse) + extract org/store claims
│   ├── tenancy.py             # NEW: resolve current org/store, scope queries
│   ├── models.py              # NEW multi-store schema models (see §5)
│   ├── seed.py                # NEW retail seeder (multi-store, all metrics, demand patterns)
│   ├── routers/               # one module per feature area (§7)
│   │   ├── stores.py  monitoring.py  energy.py  water.py  inventory.py
│   │   ├── footfall.py  sales.py  anomalies.py  waste.py  forecast.py
│   │   ├── schedule.py  insights.py  report.py
│   └── services/
│       ├── anomaly_detection.py   # generalized (reuse + extend)
│       ├── waste_engine.py        # energy/water/inventory/labor waste (reuse + extend)
│       ├── forecasting.py         # NEW: Holt-Winters/seasonal-naive/linear
│       ├── scheduler.py           # OR-Tools, demand-driven (reuse + retune)
│       ├── recommendations.py     # NEW: sustainability/cost insight generation
│       └── pdf_generator.py       # ReportLab (reuse + extend for new metrics)
└── frontend/
    └── src/
        ├── lib/ (api.ts, supabase.ts, queryClient.ts, theme tokens, format utils)
        ├── components/ (layout, shared, + per-feature folders, shared maps/constants centralized)
        └── pages/ (Dashboard, Energy&Water, Inventory, Footfall&Sales, Forecasts, Schedule, Insights, Reports, Settings, Login)
```

### 4.2 Data flow rules (carried over, hardened)
- **All CRUD goes through FastAPI** (`/api/...`) via `frontend/src/lib/api.ts`. Pages never call `supabase.from(...)` for data.
- **Supabase JS client = Auth + Realtime only.**
- Backend uses the **service-role key** (bypasses RLS); RLS grants `anon`/authenticated **SELECT scoped by org/store** for Realtime.
- All write pipelines (ingest → detect → waste/forecast) run server-side so business logic can't be bypassed.

---

## 5. Supabase Overhaul (fresh, multi-store schema)

Applied via `mcp__claude_ai_Supabase__apply_migration` against project `uccwiuglffjrecsmbnwu`. **Drops the four legacy tables** (`readings`, `anomaly_events`, `waste_events`, `schedule_entries`) and creates the new schema below. RLS on every table; Realtime on the live-updating ones.

### 5.1 Tenancy
- **organizations** — `id`, `name`, `created_at`.
- **stores** — `id`, `org_id → organizations`, `name`, `location`, `floor_area_sqm`, `max_occupancy`, `open_hour`, `close_hour`, `timezone`, `created_at`.
- **memberships** — `user_id (auth.users)`, `org_id`, `role` (owner/manager/viewer). Drives RLS scoping.

### 5.2 Resource & operations data (every table carries `store_id`)
- **meter_readings** — `resource` (electricity|water), `zone`, `value`, `unit` (kWh|m3), `ts`. (Time-series; Realtime on.)
- **footfall_readings** — `entrance/zone`, `count`, `ts`. (Realtime on.)
- **sales_records** — `ts` (hourly bucket), `revenue_myr`, `transactions`, `units_sold`, optional `category`. First-class metric.
- **inventory_items** — `sku`, `name`, `category`, `unit_cost_myr`, `perishable` (bool), `shelf_life_days`, `reorder_point`, `current_stock`, `storage_zone` (cold|dry|ambient).
- **stock_movements** — `item_id → inventory_items`, `type` (received|sold|spoiled|discarded|adjusted), `qty`, `cost_impact_myr`, `ts`.
- **staff** — `name`, `role`, `hourly_rate_myr`, `max_hours_week`, `skills` (text[]).
- **staff_availability** — `staff_id → staff`, `day_of_week` (0–6), `available` (bool).
- **schedule_entries** — `staff_id`, `staff_name`, `date`, `shift` (morning|afternoon|evening), `role`, `generated_at`. (Replaces global-destructive write with per-store scoping.)

### 5.3 Intelligence tables
- **anomaly_events** — `metric` (electricity|water|footfall|sales|inventory), `zone`, `value`, `z_score`, `severity` (HIGH|MEDIUM|LOW), `description`, `ts`, `resolved`. (Realtime on.)
- **waste_events** — `category` (energy_idle|water_leak|stock_spoilage|overstock|overstaffing), `zone/item`, `start_time`, `end_time`, `duration_hours`, `quantity`, `cost_myr`, `co2e_kg`, `action`, `anomaly_id → anomaly_events` (nullable, **adds the missing linkage**), `created_at`.
- **forecasts** — `metric`, `horizon_start`, `horizon_end`, `granularity` (hourly|daily), `points` (jsonb: predicted + lower/upper), `model` (holt_winters|seasonal_naive|linear), `generated_at`. Cache so the UI reads fast.
- **recommendations** — `category` (energy|water|inventory|labor|sustainability), `title`, `detail`, `impact_myr`, `impact_co2e`, `confidence`, `status` (new|acted|dismissed), `created_at`.
- **tariffs** — `resource` (electricity|water), `region` (e.g. peninsular|selangor), `effective_date`, `components` (jsonb: energy/capacity/network sen per kWh, water RM/m³ bands, min charge), `afa_sen_per_kwh` (TNB monthly fuel adjustment), `co2e_factor`, `source_url`, `fetched_at`, `is_fallback` (bool). The app's cost/CO₂e math reads the latest effective row per resource/region instead of hardcoded constants.

### 5.4 RLS & Realtime
- RLS: SELECT allowed where `store_id` belongs to the caller's org (via `memberships`); writes denied to `anon` (service-role bypasses). For a fast demo we may also allow a public read of a single demo store.
- Realtime publication: `meter_readings`, `footfall_readings`, `anomaly_events` (drives live dashboard + toasts). `replica identity full` where needed.

---

## 6. Predictive Insights Design (lightweight statistical)

`services/forecasting.py` exposes `forecast(series, horizon, granularity) -> points[]`:
- **Primary:** Holt-Winters / ETS (`statsmodels`) with daily+weekly seasonality for footfall, sales, energy, water.
- **Fallbacks (auto):** seasonal-naive (same hour last week) when too few points for ETS; linear trend for sparse/inventory series. Always returns a result — never throws into the request path.
- Output includes point estimate + simple confidence band (residual-based) so charts can shade uncertainty.
- **Consumers:**
  - Dashboard "next 7 days" projections per metric.
  - **Scheduler** (§7 F8) — forecasted hourly footfall/sales → required staff per shift.
  - **Inventory** — forecast demand vs stock + shelf life → spoilage/overstock/reorder recommendations.
  - **Recommendations** (F9) — flag metrics trending worse vs baseline.
- Cached into `forecasts` by APScheduler nightly (or recomputed on-demand if APScheduler is cut).

### 6.5 Live Tariff Service (for up-to-date cost & savings)
**Reality check:** there is **no official real-time pricing API** from TNB or Air Selangor — Malaysian utility tariffs are regulated/gazetted and change a few times a year (TNB July 2025, Air Selangor Sept 2025). The only genuinely month-to-month input is **TNB's AFA (Automatic Fuel Adjustment)**, published monthly. We design for that reality rather than a fictional live feed:

- `services/tariff_service.py` — `refresh_tariffs()` fetches the latest rates via `httpx` + `beautifulsoup4` from configured official sources (`mytnb.com.my` tariff/AFA page, `airselangor.com` tariff page). Robust parsing with a strict shape check.
- **Cache + fallback:** parsed rates are written to the `tariffs` table (`is_fallback=false`). On fetch/parse failure, the service keeps the last good row, and if none exists, seeds the gazetted constants from config (`is_fallback=true`). Cost math always has a value — fetching only ever *improves* accuracy.
- **Refresh cadence:** APScheduler monthly (AFA changes monthly) + a manual "Refresh tariffs" action in Settings. `GET /api/tariffs/current` exposes the active rates + `fetched_at` + source so the UI can show "rates as of <date>".
- **Consumers:** all RM cost and CO₂e calculations in F2 (energy/water), F7 (waste), F9 (recommendations & savings projections), and F10 (reports) read from this service instead of hardcoded constants — so insights and predicted savings reflect the most current published tariff, including the monthly fuel adjustment.
- Config still holds the gazetted defaults (RM 0.5443/kWh, RM 3.51/m³, 0.574 kg CO₂e/kWh) as the guaranteed fallback.

---

## 7. Functional Features (defined one-by-one)

Each feature is an independent build unit: **Data** (tables) · **Backend** (service + endpoints) · **Frontend** (page/components) · **Acceptance**. Build order is §10.

### F0 — Foundation & Multi-Store Tenancy
- **Data:** organizations, stores, memberships; RLS; seed one demo org + 1–2 stores.
- **Backend:** config, database (reuse, keep SQLite fallback), auth + `tenancy.py` (resolve current store, scope all queries), `stores.py` router (`GET /api/stores`, `GET /api/stores/{id}`), `/health`.
- **Frontend:** app shell, sidebar/topbar, **store switcher**, React Query client, auth (Login + ProtectedRoute reused), design tokens.
- **Acceptance:** log in → pick store → all pages scope to that store; `docker compose up` boots clean (with DNS fix).

### F1 — Live Monitoring Dashboard
- **Data:** reads across all metric tables (today vs yesterday).
- **Backend:** `monitoring.py` → `GET /api/monitoring/summary` (energy kWh, water m³, footfall, sales RM, occupancy %, inventory at-risk count, anomaly/waste counts, deltas).
- **Frontend:** `Dashboard` page — KPI cards (consumption deltas: lower=better; sales delta: higher=better), mini trend sparklines, anomaly/waste badges, Realtime toast on new anomaly (sonner), "Download report" button.
- **Acceptance:** all KPIs populate from seeded data on first load with zero clicks; new anomaly pushes a toast live.

### F2 — Energy & Water Module
- **Data:** meter_readings (electricity, water).
- **Backend:** `energy.py` + `water.py` → trend endpoints (daily/weekly via `date_trunc`, reuse old SQL), per-zone breakdown, cost (RM) + CO₂e using tariff constants; ingestion `POST` runs anomaly detection.
- **Frontend:** combined "Energy & Water" page — dual-axis trend chart (reuse `TrendChart`), per-zone bars, cost/CO₂e tiles, **forecast overlay** (F5).
- **Acceptance:** trends + cost + CO₂e render per store; forecast line shows next 7 days.
- **Tariffs (carry/verify):** RM 0.5443/kWh, RM 3.51/m³, 0.574 kg CO₂e/kWh (config-driven).

### F3 — Inventory & Stock Module
- **Data:** inventory_items, stock_movements.
- **Backend:** `inventory.py` → stock levels, days-of-cover, expiry/at-risk list, spoilage & overstock computation (feeds waste engine), reorder suggestions (demand forecast vs stock vs lead time).
- **Frontend:** `Inventory` page — item table (stock, days-of-cover, status chips), expiry/at-risk alerts, spoilage cost summary, reorder suggestions.
- **Acceptance:** at-risk + overstock items flagged with RM impact; reorder suggestions driven by forecast.

### F4 — Foot Traffic & Sales Module
- **Data:** footfall_readings, sales_records.
- **Backend:** `footfall.py` + `sales.py` → hourly/daily footfall + sales, conversion (sales/footfall), busyness index, peak-hour detection.
- **Frontend:** `Footfall & Sales` page — footfall vs sales chart, busyness heatmap (hour × day), conversion KPI, peak-hours callout.
- **Acceptance:** busyness heatmap + peak hours render; data feeds the scheduler and forecasts.

### F5 — Predictive Insights Engine
- **Data:** writes/reads `forecasts`.
- **Backend:** `forecasting.py` (§6) + `forecast.py` router → `GET /api/forecast?metric=&horizon=` ; nightly refresh job.
- **Frontend:** `Forecasts` page — per-metric forecast charts with confidence bands + model label; forecast overlays embedded in F2/F3/F4.
- **Acceptance:** forecasts return for every metric with a sensible band; fallback kicks in gracefully on sparse data.

### F6 — Anomaly Detection (generalized)
- **Data:** anomaly_events.
- **Backend:** extend `anomaly_detection.py` to all metrics (Z-score 24h + IQR 7d); run synchronously on ingest; fix the redundant `_severity` branch.
- **Frontend:** `Anomalies` feed (reuse `AnomalyCard`) — severity-sorted, dismiss/resolve, metric filter.
- **Acceptance:** ≥3 seeded anomalies visible; live-detected anomalies persist + push via Realtime; dismiss updates dashboard badge.

### F7 — Waste & Optimization Engine
- **Data:** waste_events (linked to anomaly via `anomaly_id`).
- **Backend:** extend `waste_engine.py` — categories: `energy_idle`, `water_leak`, `stock_spoilage`, `overstock`, `overstaffing`; each tagged RM + CO₂e + action. Ranked by cost.
- **Frontend:** `Insights`/Waste view (reuse `WasteCard`) — ranked waste with RM + CO₂e + recommended action; weekly savings banner.
- **Acceptance:** ≥3 waste stories across ≥2 categories on first load, each with cost + action.

### F8 — Smart Manpower Scheduling (demand-driven)
- **Data:** staff, staff_availability, schedule_entries; reads `forecasts` (footfall/sales).
- **Backend:** retune `scheduler.py` — derive **required staff per shift from forecasted footfall/sales** (busyness → headcount mapping), then CP-SAT solve with availability + fairness + labor-cost objective; greedy fallback on timeout. Persist scoped to store (not global-destructive).
- **Frontend:** `Schedule` page — staff + availability editor (reuse grid), "Generate from forecast" button, schedule grid (reuse `ScheduleGrid`), efficiency + projected labor cost, CSV export.
- **Acceptance:** schedule reflects forecasted demand (more staff on predicted-busy days), respects availability, solves < 3s, CSV exports.

### F9 — Sustainability Insights & Recommendations
- **Data:** recommendations (reads waste_events, forecasts, trends).
- **Backend:** `recommendations.py` + `insights.py` router → generate ranked, data-backed recommendations (e.g. "Shift HVAC off 22:00–06:00 → save RM X / Y kg CO₂e"; "Reduce SKU Z order by N → cut spoilage RM W"). Each with impact + confidence.
- **Frontend:** `Insights` page — recommendation cards (impact RM + CO₂e, act/dismiss), cumulative potential-savings banner, ESG-style summary.
- **Acceptance:** ≥5 recommendations across energy/water/inventory/labor, each with quantified impact.

### F10 — Reports
- **Data:** aggregates across all modules.
- **Backend:** extend `pdf_generator.py` + `report.py` → weekly/monthly PDF: usage totals, sales & footfall, top waste, top recommendations, forecast summary; optional Supabase Storage upload + public URL.
- **Frontend:** `Reports` page + dashboard download button.
- **Acceptance:** PDF downloads with all new sections in < 5s.

### F11 — Settings & Store Management
- **Data:** stores, memberships, staff, tariff/config.
- **Backend:** store CRUD, config (occupancy, hours) endpoints, manual "refresh tariffs" trigger.
- **Frontend:** `Settings` page — store details, staff roster, members, tariff panel (current rates + source + "Refresh" button).
- **Acceptance:** editing store config flows through to calculations; tariff refresh updates active rates.

### F12 — Live Tariff Service
- **Data:** tariffs table (§5.3); seeds gazetted fallback on first run.
- **Backend:** `tariff_service.py` (§6.5) + `tariffs.py` router → `GET /api/tariffs/current`, `POST /api/tariffs/refresh`; APScheduler monthly refresh; `httpx`+`beautifulsoup4` fetch of TNB (incl. AFA) + Air Selangor pages with strict parsing and last-good/config fallback.
- **Frontend:** "rates as of <date>" badge on cost tiles + Settings tariff panel (F11).
- **Acceptance:** `GET /api/tariffs/current` returns parsed rates with `fetched_at`; killing network falls back to last-good/config without breaking cost math; AFA reflected in electricity cost.

---

## 8. Backend Implementation Notes (reuse map)
- **Reuse largely as-is:** `database.py`, `auth.py` (add org/store claim extraction), `pdf_generator.py` structure, OR-Tools core in `scheduler.py`, anomaly Z-score/IQR core.
- **Generalize:** anomaly_detection + waste_engine from 3 hardcoded resources → metric-driven; remove the divergent hardcoded seeder events so seeded and runtime data share one code path where practical.
- **New:** `tenancy.py`, `forecasting.py`, `recommendations.py`, and per-metric routers.
- **Fix carried-over issues:** redundant `_severity` HIGH branch; occupancy %/report inconsistency; Postgres-only trend SQL guarded; wrap ingest→detect→waste in a single transaction.

## 9. Frontend Implementation Notes (reuse map)
- **Reuse:** `KpiCard`, `TrendChart`, `AnomalyCard`, `WasteCard`, `ScheduleGrid`, `LoadingSpinner`, `ErrorBoundary`, `Sidebar`/`TopBar` (re-skinned), Login/ProtectedRoute, `api.ts`/`supabase.ts` patterns.
- **Improve for ship-ready:** centralize `ZONE_LABELS`/constant maps (currently duplicated), adopt the `brand` palette via tokens, swap emoji for `lucide-react`, add TanStack Query, add a store switcher + shared auth context, add a 404 route, path alias `@/`.

---

## 10. Phased Build Plan — ONE AT A TIME: BUILD → TEST → CONTINUE

**Execution rule:** work strictly top-to-bottom. Complete one **Step**, run its **Test gate**, and only move to the next Step once the gate passes. Do not start a new Phase until every Step in the current Phase is green. Each Step is a small, runnable increment in `reswatch-retail/`.

Every Step's test gate assumes the baseline boot check: `docker compose up --build` boots clean (carry the `dns: [8.8.8.8, 8.8.4.4]` fix + non-fatal `create_db_and_tables`), `http://localhost:8000/docs` loads, `http://localhost:3000` renders without console errors.

---

### Phase 0 — Foundation (F0 + F12)
Goal: a multi-store skeleton that boots, authenticates, scopes by store, and has live tariffs ready for cost math.

- **Step 0.1 — Scaffold the new directory.** Create `reswatch-retail/` (copy Docker/Vite/Tailwind/config scaffolding from `reswatch/`, carry the DNS fix). Copy this plan in as `PROJECT_PLAN.md`.
  - *Test:* both containers boot; `/health` returns ok; blank app shell renders.
- **Step 0.2 — Apply the fresh multi-store schema to Supabase** (drop legacy tables; create tenancy + data + intelligence + `tariffs` tables; RLS; Realtime publication) via `apply_migration`.
  - *Test:* `list_tables` shows the new schema only; RLS enabled; Realtime lists meter_readings/footfall_readings/anomaly_events.
- **Step 0.3 — Backend tenancy core:** config, database (keep SQLite fallback), auth + `tenancy.py`, `stores.py` router.
  - *Test:* `GET /api/stores` returns the seeded demo store(s); a request without a store scope is rejected/blank.
- **Step 0.4 — Retail seeder:** multi-store, realistic demand patterns across all metrics (energy, water, footfall, sales, inventory, staff), ≥3 anomalies + ≥3 waste stories per demo store.
  - *Test:* `seed.py --reset` runs clean; row counts sane; re-run is idempotent.
- **Step 0.5 — Frontend shell:** sidebar/topbar, store switcher, React Query client, Login + ProtectedRoute, design tokens (`brand` palette + lucide icons).
  - *Test:* log in → pick store → shell + switcher work; switching store changes the active scope.
- **Step 0.6 — F12 Live Tariff Service:** `tariff_service.py` (fetch TNB+AFA / Air Selangor, parse, cache to `tariffs`, fallback chain) + `tariffs.py` router; seed gazetted fallback row.
  - *Test:* `GET /api/tariffs/current` returns rates + `fetched_at`; with network disabled it serves last-good/config (`is_fallback=true`); cost math never errors.

**Phase 0 gate:** clean boot, auth + store scoping, seeded data present, tariffs resolve. → Continue.

---

### Phase 1 — Core Metric Modules (F2 → F4 → F3)
Goal: each indoor metric tracked, charted, and costed end-to-end.

- **Step 1.1 — F2 Energy & Water.** Ingestion + trend/cost/CO₂e endpoints (read tariffs from F12); page with dual-axis trend + per-zone + cost/CO₂e tiles.
  - *Test:* POST a reading → it appears in trend; cost/CO₂e match tariff math; page renders seeded data with zero clicks.
- **Step 1.2 — F4 Foot Traffic & Sales.** Footfall + sales endpoints (busyness, conversion, peak hours); page with footfall-vs-sales chart + busyness heatmap.
  - *Test:* heatmap + peak hours render; conversion KPI computes; data scoped to active store.
- **Step 1.3 — F3 Inventory & Stock.** Stock levels, days-of-cover, expiry/at-risk, spoilage/overstock; page with item table + alerts + spoilage cost.
  - *Test:* at-risk + overstock items flagged with RM impact; counts match seed.

**Phase 1 gate:** all four metrics live with correct cost numbers. → Continue.

---

### Phase 2 — Intelligence Layer (F5 → F6 → F7)
Goal: forecasts, generalized anomalies, and quantified waste across every metric.

- **Step 2.1 — F5 Predictive engine.** `forecasting.py` (Holt-Winters + seasonal-naive + linear fallbacks) + `forecast.py` router; forecast overlays in F2/F3/F4 + a Forecasts page.
  - *Test:* every metric returns horizon-length points + bands; sparse-series fallback triggers without error.
- **Step 2.2 — F6 Anomaly detection (generalized).** Extend detection to all metrics; synchronous on ingest; Realtime push; Anomalies feed page.
  - *Test:* ≥3 seeded anomalies visible; a POSTed spike creates + pushes an anomaly; dismiss updates state.
- **Step 2.3 — F7 Waste & Optimization engine.** Categories energy_idle/water_leak/stock_spoilage/overstock/overstaffing, each with RM + CO₂e + action (linked to anomaly); waste view ranked by cost.
  - *Test:* ≥3 waste stories across ≥2 categories on first load, each with cost + action; numbers use live tariffs.

**Phase 2 gate:** forecasts + anomalies + waste all populated and consistent. → Continue.

---

### Phase 3 — Optimization & Insights (F8 → F9)
Goal: turn forecasts into staffing and recommendations.

- **Step 3.1 — F8 Demand-driven scheduling.** Map forecasted footfall/sales → required staff per shift; CP-SAT solve with availability + fairness + labor-cost objective; greedy fallback; per-store persistence; Schedule page + CSV.
  - *Test:* more staff scheduled on predicted-busy days; availability respected; solve < 3s; CSV valid.
- **Step 3.2 — F9 Recommendations.** `recommendations.py` generates ranked, quantified actions across energy/water/inventory/labor; Insights page with impact + cumulative savings.
  - *Test:* ≥5 recommendations, each with RM + CO₂e impact; savings use live tariffs.

**Phase 3 gate:** schedule reflects demand; recommendations are quantified. → Continue.

---

### Phase 4 — Composition & Delivery (F1 → F10 → F11 → Polish)
Goal: assemble the dashboard, reporting, settings, and ship.

- **Step 4.1 — F1 Live Monitoring Dashboard.** Compose KPIs/sparklines/badges from all modules; Realtime toast; report download button.
  - *Test:* all KPIs populate with zero clicks; new anomaly toasts live.
- **Step 4.2 — F10 Reports.** Extend PDF with sales/footfall/waste/recommendations/forecast summary; optional Storage upload.
  - *Test:* PDF downloads with all sections in < 5s; numbers match dashboard.
- **Step 4.3 — F11 Settings & Store Management.** Store CRUD, staff roster, members, tariff panel + manual refresh.
  - *Test:* editing config flows into calculations; manual tariff refresh updates active rates.
- **Step 4.4 — Polish & deploy.** Empty states, error boundaries, design-token pass, demo seed verification; deploy frontend→Vercel, backend→Render; set CORS/env.
  - *Test:* full demo path (Dashboard → Energy&Water → Inventory → Footfall&Sales → Forecasts → Schedule → Insights → Report) in < 5 min; multi-store re-scope shows no cross-store leakage.

**Phase 4 gate:** end-to-end demo passes on a clean machine. → Ship.

> Discipline: **one Step at a time — build it, run its test gate, then continue.** No Step is "done" until its gate is green; no Phase starts until the prior Phase's gate passes.

---

## 11. Verification

- **Per feature:** `docker compose up --build` boots clean (carry the `dns: [8.8.8.8, 8.8.4.4]` fix + non-fatal `create_db_and_tables`); hit the feature's endpoints via `http://localhost:8000/docs`; verify the page renders seeded data with zero clicks.
- **Supabase:** after migration, `mcp` `list_tables` shows the new schema; RLS on; Realtime publication includes meter_readings/footfall_readings/anomaly_events.
- **Forecasting:** unit-check `forecast()` returns horizon-length points with bands; fallback path triggers on a deliberately short series.
- **Scheduler:** generate from a forecasted-busy week → confirm more staff on predicted-busy days, availability respected, solve < 3s, CSV export valid.
- **End-to-end demo path:** Dashboard → Energy&Water → Inventory → Footfall&Sales → Forecasts → Schedule → Insights → Report download, all on the demo store, in < 5 min.
- **Multi-store:** switch store → all data re-scopes; no cross-store leakage (RLS check from browser console with anon key).

---

## 12. Out of Scope
- Transportation/fleet metrics (other teammate's section).
- Real POS/IoT hardware integration — all data is **seeded/simulated** for the demo (schema is integration-ready).
- A "real-time tariff API" — **none exists** from TNB/Air Selangor (regulated/gazetted pricing). We auto-refresh published rates + the monthly AFA via fetch-and-parse with config fallback (§6.5), which is the accurate, up-to-date approach actually available.
- Billing/payments, full user management beyond memberships.
