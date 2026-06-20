from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True, connect_args=connect_args)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.execute(text("select 1"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
