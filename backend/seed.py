"""
ResWatch Retail — Demo Data Seeder

Usage:
    python seed.py              # skips if data exists
    python seed.py --reset      # clears all tables first
    python seed.py --email you@example.com  # link membership to a specific user
"""

import argparse
import json
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

random.seed(42)

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

ELEC_TARIFF  = 0.5443
WATER_TARIFF = 3.51
CO2E_FACTOR  = 0.574

NOW  = datetime.now(timezone.utc)
DAY0 = NOW - timedelta(days=90)   # 90 days so 30d selector has a valid prior window

STORE_NAME = "The Grand Bazaar"
STORE_LOC  = "Lot G-12, Taylor's Lakeside City Mall, Subang Jaya"
ORG_NAME   = "Grand Bazaar Holdings Sdn Bhd"

STAFF_ROSTER = [
    {"name": "Aisha Binti Rahman",   "role": "supervisor",   "rate": 12.00, "max_h": 44, "off": [6]},
    {"name": "Rahul Nair",           "role": "supervisor",   "rate": 12.00, "max_h": 40, "off": [5]},
    {"name": "Farid Bin Ismail",     "role": "associate",    "rate": 8.50,  "max_h": 40, "off": []},
    {"name": "Mei Ling Tan",         "role": "associate",    "rate": 8.50,  "max_h": 40, "off": [0]},
    {"name": "Karthik Subramaniam",  "role": "associate",    "rate": 8.50,  "max_h": 44, "off": []},
    {"name": "Wei Jun Lim",          "role": "cashier",      "rate": 9.00,  "max_h": 40, "off": [5, 6]},
    {"name": "Nurul Ain Binti Aziz", "role": "associate",    "rate": 8.50,  "max_h": 44, "off": [6]},
]

INVENTORY = [
    ("SKU-001", "Nasi Lemak Set",        "F&B",       3.50, True,  2,   20, 45, "cold"),
    ("SKU-002", "Teh Tarik Pack (6)",    "F&B",       8.00, True,  7,   10,  8, "cold"),
    ("SKU-003", "Roti Canai Frozen",     "F&B",       5.20, True,  30,  15,  6, "cold"),
    ("SKU-004", "Mineral Water 500ml",   "Beverages", 0.80, False, None,50,120, "ambient"),
    ("SKU-005", "100Plus 330ml",         "Beverages", 1.50, False, None,40, 95, "ambient"),
    ("SKU-006", "Milo Packet 200ml",     "Beverages", 1.20, True,  90,  30, 22, "ambient"),
    ("SKU-007", "Disposable Cups (50)",  "Packaging", 4.50, False, None,10,  8, "dry"),
    ("SKU-008", "Paper Bags (100)",      "Packaging", 6.00, False, None, 5,  4, "dry"),
    ("SKU-009", "Hand Sanitiser 500ml",  "Hygiene",   9.90, False, None,10, 18, "ambient"),
    ("SKU-010", "Face Masks (50pcs)",    "Hygiene",  12.00, False, None, 5, 11, "dry"),
    ("SKU-011", "Cashier Receipt Roll",  "Stationery",3.80, False, None, 8, 14, "dry"),
    ("SKU-012", "Price Tag Stickers",    "Stationery",2.50, False, None, 5,  9, "dry"),
    ("SKU-013", "Curry Puff (12pcs)",    "F&B",       9.00, True,   1,  30, 10, "cold"),
    ("SKU-014", "Iced Coffee Sachet",    "Beverages", 0.90, False, None,60,180, "ambient"),
    ("SKU-015", "Coconut Water 330ml",   "Beverages", 2.50, True,  21,  20,  5, "cold"),
    ("SKU-016", "Tissue Box 3-ply",      "Hygiene",   5.50, False, None,10, 24, "ambient"),
    ("SKU-017", "Cleaning Liquid 1L",    "Hygiene",  11.00, False, None, 5,  7, "dry"),
    ("SKU-018", "Eco Bag (Reusable)",    "Packaging", 3.00, False, None,20, 35, "dry"),
    ("SKU-019", "Bubble Tea Cups (50)",  "Packaging", 7.50, False, None, 8,  3, "dry"),
    ("SKU-020", "Ice Cream Bar",         "F&B",       2.80, True,  14,  15,  2, "cold"),
]


def connect() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        DATABASE_URL,
        keepalives=1,
        keepalives_idle=20,
        keepalives_interval=5,
        keepalives_count=5,
        connect_timeout=15,
    )


def ev(cur, sql: str, rows: list, page_size: int = 500) -> None:
    """execute_values wrapper."""
    psycopg2.extras.execute_values(cur, sql, rows, page_size=page_size)


def reset(cur, conn) -> None:
    tables = [
        "recommendations", "waste_events", "anomaly_events", "forecasts",
        "schedule_entries", "staff_availability", "staff",
        "stock_movements", "inventory_items",
        "sales_records", "footfall_readings", "meter_readings",
        "tariffs", "memberships", "stores", "organizations",
    ]
    for t in tables:
        cur.execute(f"delete from {t}")
    conn.commit()
    print("  tables cleared")


def seed_org_store(cur, conn) -> tuple[str, str]:
    cur.execute("insert into organizations (name) values (%s) returning id", (ORG_NAME,))
    org_id = cur.fetchone()[0]
    cur.execute(
        "insert into stores (org_id,name,location,floor_area_sqm,max_occupancy,open_hour,close_hour) "
        "values (%s,%s,%s,%s,%s,%s,%s) returning id",
        (org_id, STORE_NAME, STORE_LOC, 320.0, 80, 10, 22),
    )
    store_id = cur.fetchone()[0]
    conn.commit()
    print(f"  org={org_id}  store={store_id}")
    return org_id, store_id


def seed_membership(cur, conn, org_id: str, email: str | None) -> None:
    if not email:
        print("  [skip] no --email provided")
        return
    cur.execute("select id from auth.users where email = %s", (email,))
    row = cur.fetchone()
    if not row:
        print(f"  [skip] user {email!r} not in auth.users — add via Supabase dashboard")
        return
    cur.execute(
        "insert into memberships (user_id,org_id,role) values (%s,%s,'owner') on conflict do nothing",
        (row[0], org_id),
    )
    conn.commit()
    print(f"  membership: {row[0]} → {org_id}")


def seed_tariffs(cur, conn) -> None:
    rows = [
        ("electricity", "peninsular", date(2025, 9, 1),
         json.dumps({"energy_sen_per_kwh": 37.03, "capacity_sen_per_kwh": 4.55, "network_sen_per_kwh": 12.85}),
         0.0, CO2E_FACTOR,
         "https://www.mytnb.com.my/business/understand-your-bill/pricing-tariff", True),
        ("water", "peninsular", date(2025, 9, 1),
         json.dumps({"tier1_rm_per_m3": 3.51, "min_charge_myr": 36.00}),
         0.0, 0.0,
         "https://www.airselangor.com/tariff", True),
    ]
    ev(cur,
       "insert into tariffs (resource,region,effective_date,components,afa_sen_per_kwh,co2e_factor,source_url,is_fallback) values %s",
       rows)
    conn.commit()
    print("  tariff rows inserted")


def seed_meter_readings(cur, conn, store_id: str) -> None:
    """
    Realistic values for a 320 sqm Malaysian retail store:
      Electricity — shop floor ~3.5 kWh/hr open (AC + LED lighting + display)
                    storage ~1.5 kWh/hr open, 1.2 closed (fridge runs 24/7)
                    office ~0.6 kWh/hr open
      → ~90 kWh/day, ~2,700 kWh/month, ~RM 1,470/month ✓
      Water — kitchen ~0.12 m³/hr open, restroom ~0.05 m³/hr open
      → ~2 m³/day, ~55 m³/month, ~RM 193/month ✓
    """
    rows = []
    total_hours = 90 * 24
    for h in range(total_hours):
        ts = DAY0 + timedelta(hours=h)
        hour = ts.hour
        weekday = ts.weekday()
        is_open = (weekday < 6) and (10 <= hour < 22)
        is_busy = is_open and (12 <= hour < 14 or 17 <= hour < 20)

        for zone, base_open, base_closed in [
            ("shop_floor",   3.5,  0.4),
            ("storage_room", 1.5,  1.2),
            ("office",       0.6,  0.05),
        ]:
            base = base_open if is_open else base_closed
            if is_busy:
                base *= 1.25
            val = max(0.01, base + random.gauss(0, base * 0.08))
            rows.append((store_id, "electricity", zone, round(val, 3), "kWh", ts))

        for zone, base_open, base_closed in [
            ("kitchen",  0.12, 0.003),
            ("restroom", 0.05, 0.002),
        ]:
            base = base_open if is_open else base_closed
            if is_busy:
                base *= 1.4
            val = max(0.001, base + random.gauss(0, base * 0.10))
            rows.append((store_id, "water", zone, round(val, 4), "m3", ts))

    # Insert in chunks to avoid long-running transactions on slow connections
    chunk = 500
    for i in range(0, len(rows), chunk):
        ev(cur,
           "insert into meter_readings (store_id,resource,zone,value,unit,ts) values %s",
           rows[i:i+chunk])
        conn.commit()
    print(f"  {len(rows):,} meter readings inserted")


def seed_footfall(cur, conn, store_id: str) -> list[tuple]:
    rows = []
    footfall_data = []
    for h in range(90 * 24):
        ts = DAY0 + timedelta(hours=h)
        hour = ts.hour
        weekday = ts.weekday()
        is_open = (weekday < 6) and (10 <= hour < 22)

        if not is_open or weekday == 6:
            count = 0
        else:
            if 10 <= hour < 12:   base = 8
            elif 12 <= hour < 14: base = 35
            elif 14 <= hour < 17: base = 18
            elif 17 <= hour < 20: base = 42
            elif 20 <= hour < 22: base = 15
            else:                 base = 0
            if weekday == 5:
                base = int(base * 1.4)
            count = max(0, int(base + random.gauss(0, base * 0.15 + 1)))

        rows.append((store_id, "main_entrance", count, ts))
        footfall_data.append((ts, count))

    chunk = 500
    for i in range(0, len(rows), chunk):
        ev(cur,
           "insert into footfall_readings (store_id,zone,count,ts) values %s",
           rows[i:i+chunk])
        conn.commit()
    print(f"  {len(rows):,} footfall readings inserted")
    return footfall_data


def seed_sales(cur, conn, store_id: str, footfall_data: list[tuple]) -> None:
    rows = []
    for ts, count in footfall_data:
        if count == 0:
            continue
        transactions = max(0, int(count * random.uniform(0.60, 0.75)))
        revenue = round(transactions * random.uniform(12.0, 18.0) * (1 + random.gauss(0, 0.05)), 2)
        units = max(transactions, int(transactions * random.uniform(1.2, 2.5)))
        cat = random.choice(["F&B", "Beverages", "Packaging", "Hygiene", "Stationery"])
        rows.append((store_id, ts, max(0.0, revenue), transactions, units, cat))

    chunk = 500
    for i in range(0, len(rows), chunk):
        ev(cur,
           "insert into sales_records (store_id,ts,revenue_myr,transactions,units_sold,category) values %s",
           rows[i:i+chunk])
        conn.commit()
    print(f"  {len(rows):,} sales records inserted")


def seed_inventory(cur, conn, store_id: str) -> dict[str, str]:
    sku_to_id: dict[str, str] = {}
    for sku, name, cat, cost, perish, shelf, reorder, stock, zone in INVENTORY:
        cur.execute(
            "insert into inventory_items "
            "(store_id,sku,name,category,unit_cost_myr,perishable,shelf_life_days,"
            "reorder_point,current_stock,storage_zone) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (store_id, sku, name, cat, cost, perish, shelf, reorder, stock, zone),
        )
        sku_to_id[sku] = cur.fetchone()[0]
    conn.commit()

    mov_rows = []
    for sku, _, _, cost, perish, _, _, stock, _ in INVENTORY:
        item_id = sku_to_id[sku]
        mov_rows.append((store_id, item_id, "received", stock + random.randint(5, 20),
                         cost * (stock + 15), DAY0))
        if perish:
            for d in range(0, 90, 3):
                spoiled = random.randint(1, 4)
                ts = DAY0 + timedelta(days=d, hours=random.randint(6, 10))
                mov_rows.append((store_id, item_id, "spoiled", spoiled, -(cost * spoiled), ts))

    ev(cur,
       "insert into stock_movements (store_id,item_id,type,qty,cost_impact_myr,ts) values %s",
       mov_rows)
    conn.commit()
    print(f"  {len(INVENTORY)} items + {len(mov_rows)} stock movements inserted")
    return sku_to_id


def seed_staff(cur, conn, store_id: str) -> list[str]:
    staff_ids = []
    for s in STAFF_ROSTER:
        cur.execute(
            "insert into staff (store_id,name,role,hourly_rate_myr,max_hours_week) "
            "values (%s,%s,%s,%s,%s) returning id",
            (store_id, s["name"], s["role"], s["rate"], s["max_h"]),
        )
        staff_ids.append(cur.fetchone()[0])
    conn.commit()

    av_rows = []
    for i, sid in enumerate(staff_ids):
        for dow in range(7):
            av_rows.append((sid, store_id, dow, dow not in STAFF_ROSTER[i]["off"]))
    ev(cur,
       "insert into staff_availability (staff_id,store_id,day_of_week,available) values %s",
       av_rows)
    conn.commit()
    print(f"  {len(staff_ids)} staff inserted")
    return staff_ids


def seed_anomalies(cur, conn, store_id: str) -> list[str]:
    anomaly_ids = []
    anomalies = [
        ("electricity", "shop_floor",    9.4,   4.31, "HIGH",
         "Shop floor electricity 9.4 kWh last hour — 4.3σ above 7-day mean. HVAC may be running outside store hours.", 1),
        ("electricity", "shop_floor",    8.9,   3.91, "HIGH",
         "Shop floor electricity spiked to 8.9 kWh — 3.9σ above 90-day mean. Likely HVAC left on overnight.", 5),
        ("water",       "kitchen",       0.48,  4.12, "HIGH",
         "Kitchen water 0.48 m³ in one hour — 4.1σ above baseline. Possible tap left running.", 9),
        ("electricity", "storage_room",  3.8,   2.78, "MEDIUM",
         "Storage room elevated 3.8 kWh — 2.8σ. Cold room compressor may be overworking.", 14),
        ("footfall",    "main_entrance", 0.0,  -2.60, "MEDIUM",
         "Zero footfall on Saturday opening hours — possible entrance blockage.", 18),
        ("sales",       None,           12.5,   2.55, "LOW",
         "Sales 89% below Saturday average — correlates with footfall anomaly.", 18),
    ]
    for metric, zone, value, z, sev, desc, days_ago in anomalies:
        ts = NOW - timedelta(days=days_ago, hours=random.randint(1, 5))
        cur.execute(
            "insert into anomaly_events "
            "(store_id,metric,zone,value,z_score,severity,description,ts,resolved) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (store_id, metric, zone, value, z, sev, desc, ts, days_ago > 15),
        )
        anomaly_ids.append(cur.fetchone()[0])
    conn.commit()
    print(f"  {len(anomaly_ids)} anomaly events inserted")
    return anomaly_ids


def seed_waste(cur, conn, store_id: str, anomaly_ids: list[str]) -> None:
    wastes = [
        ("energy_idle",    "shop_floor",  6.0,  21.0,
         round(21.0 * ELEC_TARIFF, 2),  round(21.0 * CO2E_FACTOR, 2),
         "Install motion-sensor lighting and auto-HVAC shutoff after 22:00.", 0),
        ("water_leak",     "kitchen",     2.0,  None,
         round(0.48 * WATER_TARIFF, 2), None,
         "Inspect kitchen tap and main valve. Install smart flow sensor.", 1),
        ("energy_idle",    "storage_room",4.0,   4.8,
         round(4.8 * ELEC_TARIFF, 2),   round(4.8 * CO2E_FACTOR, 2),
         "Check cold-room door seal and thermostat.", 2),
        ("stock_spoilage", None,          None, None,
         round(3 * 3.50 + 2 * 9.00, 2), None,
         "Reduce Nasi Lemak order to 3×/week. FIFO rotation.", None),
        ("overstock",      None,          None, None,
         round(35 * 0.90, 2),            None,
         "Iced Coffee Sachet (180 units) exceeds 60-day cover. Pause next 2 orders.", None),
    ]
    for i, (cat, zone, dur, kwh, cost, co2e, action, anidx) in enumerate(wastes):
        anom_id = anomaly_ids[anidx] if anidx is not None else None
        start = NOW - timedelta(days=5 + i, hours=3)
        end   = (start + timedelta(hours=dur)) if dur else None
        cur.execute(
            "insert into waste_events "
            "(store_id,category,zone,start_time,end_time,duration_hours,"
            "quantity,cost_myr,co2e_kg,action,anomaly_id) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (store_id, cat, zone, start, end, dur, kwh, cost, co2e, action, anom_id),
        )
    conn.commit()
    print(f"  {len(wastes)} waste events inserted")


def seed_recommendations(cur, conn, store_id: str) -> None:
    recs = [
        ("energy",         "Auto-shutoff HVAC after close",
         "Shop floor HVAC left on overnight 4× last week. Auto-schedule saves est. RM 78/month.",
         78.0, 21.2, 0.88),
        ("water",          "Install kitchen flow sensor",
         "Two water anomalies in 30 days. Smart sensor saves est. RM 42/month.",
         42.0, None, 0.82),
        ("inventory",      "Reduce perishable over-ordering",
         "8 spoilage events detected. Cut orders by 20% → save RM 185/month.",
         185.0, None, 0.91),
        ("labor",          "Align staffing with footfall forecast",
         "Sat evenings understaffed (avg 38 customers/hr vs 2 staff). Add 1 shift.",
         1200.0, None, 0.75),
        ("sustainability", "Switch to LED lighting in storage",
         "Incandescent fittings in storage. LED retrofit: payback 4 months, then RM 22/month.",
         22.0, 12.0, 0.79),
    ]
    for cat, title, detail, impact_myr, impact_co2e, conf in recs:
        cur.execute(
            "insert into recommendations "
            "(store_id,category,title,detail,impact_myr,impact_co2e,confidence,status) "
            "values (%s,%s,%s,%s,%s,%s,%s,'new')",
            (store_id, cat, title, detail, impact_myr, impact_co2e, conf),
        )
    conn.commit()
    print(f"  {len(recs)} recommendations inserted")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--email", default=None)
    args = parser.parse_args()

    conn = connect()
    cur = conn.cursor()
    # Disable statement timeout for this session
    conn.autocommit = True
    cur.execute("SET statement_timeout = 0")
    conn.autocommit = False

    try:
        if args.reset:
            print("Resetting tables...")
            reset(cur, conn)

        cur.execute("select count(*) from organizations")
        if cur.fetchone()[0] > 0:
            print("Data already exists. Use --reset to reseed.")
            return

        print("Seeding org + store...")
        org_id, store_id = seed_org_store(cur, conn)

        print("Seeding membership...")
        seed_membership(cur, conn, org_id, args.email)

        print("Seeding tariffs...")
        seed_tariffs(cur, conn)

        print("Seeding meter readings (90d × 5 zones)...")
        seed_meter_readings(cur, conn, store_id)

        print("Seeding footfall (30d)...")
        footfall_data = seed_footfall(cur, conn, store_id)

        print("Seeding sales (30d)...")
        seed_sales(cur, conn, store_id, footfall_data)

        print("Seeding inventory...")
        seed_inventory(cur, conn, store_id)

        print("Seeding staff...")
        seed_staff(cur, conn, store_id)

        print("Seeding anomalies...")
        anomaly_ids = seed_anomalies(cur, conn, store_id)

        print("Seeding waste events...")
        seed_waste(cur, conn, store_id, anomaly_ids)

        print("Seeding recommendations...")
        seed_recommendations(cur, conn, store_id)

        print(f"\nDone. Store ID: {store_id}")
        print("Set X-Store-Id to this value in API requests.")

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
