from pathlib import Path
import json
from sqlalchemy import create_engine, text

# load .env (robust): look next to repo root, and allow env var fallback
values = {}
env_path = Path(__file__).resolve().parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        values[k.strip()] = v.strip()

# prefer explicit environment variable if present
import os
import re
db = os.environ.get('DATABASE_URL') or values.get('DATABASE_URL')

def sanitize_db_url(s: str) -> str:
    if not s:
        return s
    s = s.strip()
    # remove common "export VAR=..." shells
    if s.lower().startswith('export '):
        s = s.split(' ', 1)[1]
    # strip surrounding quotes
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1]
    # remove any leading non-alphanumeric characters (sometimes introduced by bad paste/redirect)
    s = re.sub(r'^[^A-Za-z0-9]+', '', s)
    return s

db = sanitize_db_url(db)

# best-effort parse host for debugging (mask password when printing)
masked_host = None
try:
    from sqlalchemy.engine import make_url
    url = make_url(db)
    masked_host = url.host
except Exception:
    # fallback: try to extract host after '@'
    if db and '@' in db:
        masked_host = db.split('@', 1)[1]
        # if there is a leading '>' or other char, strip it for display
        masked_host = re.sub(r'^[^A-Za-z0-9]+', '', masked_host)

if masked_host:
    print(json.dumps({'info': f'Using DB host: {masked_host}'}))
if not db:
    print(json.dumps({'error':'DATABASE_URL missing'}))
    raise SystemExit(1)

engine = create_engine(db)
out = {'tables':[], 'pgcrypto':False, 'rls':{}, 'policies':[], 'publications':[], 'publication_tables':[], 'counts':{}, 'errors':[]}
with engine.connect() as conn:
    try:
        rows = conn.execute(text("select table_schema, table_name from information_schema.tables where table_schema='public' order by table_name"))
        out['tables'] = [dict(r) for r in rows]
    except Exception as e:
        out['errors'].append(f"tables: {e}")
    try:
        r = conn.execute(text("select extname from pg_extension where extname='pgcrypto'"))
        out['pgcrypto'] = any([True for _ in r])
    except Exception as e:
        out['errors'].append(f"pgcrypto: {e}")
    try:
        r = conn.execute(text("select n.nspname, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relkind='r' order by c.relname"))
        for row in r:
            out['rls'][row['relname']] = bool(row['relrowsecurity'])
    except Exception as e:
        out['errors'].append(f"rls: {e}")
    try:
        r = conn.execute(text("select polname, polrelid::regclass::text as table_name, polcmd, polroles::text, polqual::text, polwithcheck::text from pg_policy order by polname"))
        out['policies'] = [dict(row) for row in r]
    except Exception as e:
        out['errors'].append(f"policies: {e}")
    try:
        r = conn.execute(text("select p.pubname from pg_publication p"))
        out['publications'] = [row['pubname'] for row in r]
        r2 = conn.execute(text("select * from pg_publication_tables"))
        out['publication_tables'] = [dict(row) for row in r2]
    except Exception as e:
        out['errors'].append(f"publications: {e}")
    migration_tables = ['organizations','stores','memberships','transportation_locations','fleet_vehicles','transportation_routes','transportation_route_stops','shipments','shipment_location_events','vehicle_fuel_logs','vehicle_telemetry','vehicle_maintenance_events']
    for t in migration_tables:
        try:
            r = conn.execute(text(f"select count(*) as c from public.{t}"))
            out['counts'][t] = int(r.scalar_one())
        except Exception as e:
            out['counts'][t] = None
print(json.dumps(out, indent=2))
