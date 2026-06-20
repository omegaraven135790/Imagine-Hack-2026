"""
Shared psycopg2 connection factory.

seed.py and link_user.py import pg_connect from here instead of
calling psycopg2.connect with hand-rolled kwargs each time.
The URL always comes from settings.database_url (config.py / DATABASE_URL
env var) so there is exactly one source of truth for the connection string.
"""
import psycopg2
import psycopg2.extensions

from config import settings

# Standard options applied to every raw psycopg2 connection.
# sslmode is embedded in the DATABASE_URL query string (?sslmode=require)
# and is therefore honoured automatically by psycopg2.
PG_CONNECT_KWARGS: dict = {
    "connect_timeout": 15,
    "keepalives": 1,
    "keepalives_idle": 20,
    "keepalives_interval": 5,
    "keepalives_count": 5,
}


def pg_connect(**overrides) -> psycopg2.extensions.connection:
    """
    Return a psycopg2 connection using the configured DATABASE_URL with
    standard keepalive and timeout settings.

    Pass keyword overrides to change individual options for a specific caller:
        pg_connect(connect_timeout=30)
    """
    kwargs = {**PG_CONNECT_KWARGS, **overrides}
    return psycopg2.connect(settings.database_url, **kwargs)
