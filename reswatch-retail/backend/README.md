# ResWatch Transportation Backend

FastAPI backend for the transportation section of ResWatch Retail.

## Supabase Project

- Project REST URL: `https://uccwiuglffjrecsmbnwu.supabase.co/rest/v1/`
- Project URL: `https://uccwiuglffjrecsmbnwu.supabase.co`
- Schema migration: `migrations/20260620_transportation_schema.sql`

The REST URL can read and write rows after tables and RLS policies exist, but it cannot
create tables. Run the migration through Supabase SQL Editor, Supabase CLI, `psql`, or a
Supabase MCP tool with SQL migration support.

## Local Run

```powershell
cd reswatch-retail/backend
C:\Users\prema\AppData\Local\Programs\Python\Python312\python.exe -m pip install -r requirements.txt
C:\Users\prema\AppData\Local\Programs\Python\Python312\python.exe -m uvicorn main:app --reload
```

Open `http://localhost:8000/docs`.

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
