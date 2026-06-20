# ResWatch Retail

**ImagineHack 2026 · Track 3 — Smarter Resource Management**

An AI-assisted resource management platform for Malaysian retail SMEs. Monitors energy, water, inventory, footfall, and staff — detects waste in real time, forecasts demand, and auto-generates optimised weekly schedules.

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- A `.env` file with your Supabase credentials (copy from `.env.example`)

### One-click launch (Windows)

Double-click **`start.bat`** in the project root. It will:
1. Build and start all containers
2. Wait for the backend health check to pass
3. Open your browser at **http://localhost:3000** automatically

---

## Manual Setup

```bash
# 1 — Copy environment file and fill in your Supabase values
copy .env.example .env

# 2 — Start all services
docker compose up --build -d

# 3 — Seed demo data (first run only)
docker exec -it reswatch-retail-backend python seed.py --email your@email.com

# 4 — Open the app
start http://localhost:3000
```

### URLs

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Frontend (React app) |
| http://localhost:8000 | Backend API |
| http://localhost:8000/docs | FastAPI interactive docs |
| http://localhost:8000/health | Health check |

---

## Architecture

```
reswatch-retail/
├── backend/              FastAPI + SQLModel (Python 3.12)
│   ├── routers/          API endpoints per feature module
│   ├── services/         Forecasting, anomaly detection, scheduler, waste engine
│   ├── auth.py           Supabase JWT verification
│   ├── tenancy.py        Multi-store middleware (X-Store-Id header)
│   └── seed.py           90-day demo data seeder
├── frontend/             React 18 + Vite + TailwindCSS
│   └── src/pages/        Dashboard, Energy, Inventory, Footfall, Forecasts,
│                         Anomalies, Waste, Schedule
├── docker-compose.yml
├── .env.example
└── start.bat             One-click Windows launcher
```

---

## Features

| Module | Description |
|--------|-------------|
| Energy & Water | Live meter readings, zone breakdown, CO₂e tracking, tariff costing (TNB/Air Selangor) |
| Inventory | Stock status, days-of-cover, perishable risk, spoilage cost |
| Footfall & Sales | DOW/hour heatmap, peak slots, conversion rate |
| Forecasting | Holt-Winters ETS → seasonal-naive → linear; 6h forecast cache |
| Anomaly Detection | Z-score + IQR dual-method; fires on every ingest before INSERT |
| Waste Engine | Live: energy_idle, water_leak, stock_spoilage, overstock |
| Scheduling | CP-SAT (OR-Tools) demand-driven roster; greedy fallback; CSV export |

---

## Stack

- **Backend** — Python 3.12, FastAPI, SQLModel, OR-Tools CP-SAT, statsmodels
- **Frontend** — React 18, TypeScript, Vite, TailwindCSS, TanStack Query v5, Recharts
- **Database** — Supabase (Postgres 15 + Auth JWT)
- **Infrastructure** — Docker Compose

---

## Environment Variables

Copy `.env.example` → `.env`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_KEY` | Service role key (backend only, never exposed to browser) |
| `JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `VITE_SUPABASE_URL` | Same URL, for frontend |
| `VITE_SUPABASE_ANON_KEY` | Same anon key, for frontend |
| `VITE_API_BASE_URL` | Backend URL visible to browser (`http://localhost:8000`) |

---

## Demo Data

The seeder creates **The Grand Bazaar** (Taylor's Lakeside City Mall, Subang Jaya):
- 90 days of electricity, water, footfall, and sales readings
- 20 inventory SKUs with spoilage history
- 7 staff (2 supervisors, 1 cashier, 4 associates)
- Anomaly events, waste stories, and recommendations

```bash
# Seed (first time)
docker exec -it reswatch-retail-backend python seed.py --email your@email.com

# Re-seed from scratch
docker exec -it reswatch-retail-backend python seed.py --reset --email your@email.com
```

---

*ResWatch Retail — ImagineHack 2026, Track 3: Smarter Resource Management*
