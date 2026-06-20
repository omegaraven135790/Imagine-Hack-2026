# ResWatch Transportation Backend

FastAPI backend for the transportation section of ResWatch Retail.

## Supabase Project

- Project REST URL: `https://uccwiuglffjrecsmbnwu.supabase.co/rest/v1/`
- Project URL: `https://uccwiuglffjrecsmbnwu.supabase.co`

The transportation schema is defined in `supabase_transportation_setup.sql`.
It is additive and safe to re-run, and it is the file to apply in Supabase SQL Editor or `psql`.

The REST URL can read and write rows after tables and RLS policies exist, but it cannot
create tables. Run the setup script through Supabase SQL Editor, Supabase CLI, `psql`, or a
Supabase MCP tool with SQL support.

The backend connects through `DATABASE_URL` and will fail fast on startup if the database
is unreachable or misconfigured.

The transportation demo dashboard now reads from Supabase REST and can still start even if
the direct Postgres URL is unavailable. Use the demo seed endpoint to populate the tables.

## Local Run

```powershell
cd reswatch-retail/backend
C:\Users\prema\AppData\Local\Programs\Python\Python312\python.exe -m pip install -r requirements.txt
C:\Users\prema\AppData\Local\Programs\Python\Python312\python.exe -m uvicorn main:app --reload
```

Open `http://localhost:8000/docs`.

Database health check:

- `GET /health/db`

Demo dashboard and seed:

- `GET /api/transportation/demo-ui`
- `POST /api/transportation/demo/seed`

## API Scope

All transportation endpoints require:

- `X-Org-Id`
- `X-Store-Id`

Router prefix: `/api/transportation`

Implemented resources:

- locations
- fleet vehicles
- routes and route stops
- shipments and shipment location events
- fuel logs
- vehicle telemetry for speed and distance traveled
- maintenance events
- transportation summary metrics
