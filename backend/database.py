from sqlmodel import SQLModel, create_engine, Session
from config import settings

# SQLAlchemy passes connect_args straight to psycopg2 (or sqlite3).
# For Postgres, apply the same timeout/keepalive values used by
# seed.py and link_user.py via db_connect.PG_CONNECT_KWARGS so all
# three connection paths behave consistently.
# sslmode is already embedded in the DATABASE_URL (?sslmode=require)
# and is honoured by psycopg2 without a separate connect_arg.
if settings.database_url.startswith("sqlite"):
    connect_args: dict = {"check_same_thread": False}
else:
    connect_args = {
        "connect_timeout": 15,
        "keepalives": 1,
        "keepalives_idle": 20,
        "keepalives_interval": 5,
        "keepalives_count": 5,
    }

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,   # recycle stale connections before use
    pool_recycle=1800,    # force-recycle connections older than 30 min
)


def create_db_and_tables() -> None:
    """
    Creates any SQLModel-defined tables that don't exist yet.
    In production the Supabase schema is applied via migration SQL,
    so this is effectively a no-op once the schema is in place.
    Called from main.py lifespan wrapped in try/except so startup
    never crashes on a transient DB connection failure.
    """
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
