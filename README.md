# ResWatch Retail

**ImagineHack 2026 · Track 3 — Smarter Resource Management**

An AI-assisted resource management platform for Malaysian retail SMEs. Monitors energy, water, inventory, footfall, and staff — detects waste in real time, forecasts demand, and auto-generates optimised weekly schedules.

Description:

This all-in-one operations platform optimizes business efficiency and sustainability by monitoring real-time stock levels, alerting teams before product quality declines, and predicting future sales to minimize waste and maximize savings. It automatically detects and tracks operational anomalies; both unsolved and resolved. The software also schedules staff based on availability and provides actionable insights into CO2 emissions. Backed by an integrated AI chat assistant for instant team feedback, the platform unifies inventory, labor, and environmental tracking into a single dashboard to cut costs and lower your carbon footprint.

Team Members:

Doshyant Raj a/l Thiruchelvan Balakrishnan (leader)

Aiman Hakeem Bin Ahmad Tarmizi

Woon Kee Ven

Andrew Leewei Hobbs

Technologies Used

- Gemini was used for research and better understanding during the planning phase.
- Figma was used to design the user interface.
- ai assisted in accelerating the development process.
- Copilot helped in the transport feature in the final product.
- Supabase was used as the database for this project.

Challenges

- The Transport feature needed debugging due to the API key being collected wrongly by other script. Problems arose with push and pull data within the database.
- Transport and Retail had different user interfaces and needed to be unified at the end. Fixing these challenges ensures consistency.

Approach:

- Day 1: Task was distributed between teammates based on skill and specialist.
- Day 2: 2 people was assigned in building the backend, 1 was assigned with front end development and 1 more towards the pitching deck.

Why was TRACK 3 chosen?

- The open-end nature of this work allowed more creativity and enjoyment within the development process.
- The environmental impact of this work provided a strong sense of purpose and natural motivation.
- Leveraging data analytics as a core project component fueled our curiosity and analytical interest.

Canva Link:

https://www.canva.com/design/DAHNFIJXLkg/kuWO5M0GwRfPs917eJQnvQ/edit?ui=e30



---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (IPv6 daemon config NOT required — uses IPv4 pooler)

### One-click launch (Windows)

Double-click **`start.bat`** in the project root. It will:
1. Build and start all containers
2. Wait for the backend health check to pass
3. Open your browser at **http://localhost:3000** automatically

> ✅ **No setup needed** — a working `.env` is included in this branch and demo data is already seeded in the shared Supabase project. Just clone and run.

---

## Manual Setup

```bash
# 1 — (Optional) Bring your own Supabase project
#     Copy .env.example → .env and fill in your credentials
copy .env.example .env

# 2 — Start all services
docker compose up --build -d

# 3 — (Optional) Seed demo data into your own DB
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
│                         Anomalies, Waste, Schedule, Insights, Transportation,
│                         Settings
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

A working `.env` is included in this branch for demo use. To run your own instance, copy `.env.example` → `.env` and fill in your Supabase values (use the IPv4 Session pooler URL from **Supabase → Settings → Database → Connection pooling**).

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
