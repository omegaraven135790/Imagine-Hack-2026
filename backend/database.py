from sqlmodel import SQLModel, create_engine, Session
from config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)


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
