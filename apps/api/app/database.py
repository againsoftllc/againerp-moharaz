import os
import re
from collections.abc import AsyncGenerator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


class Base(DeclarativeBase):
    pass


settings = get_settings()
database_url = _normalize_database_url(settings.database_url)

# The live shop serves every page, crawler and old-site image link through this one process: SQLAlchemy's default
# 5 + 10 connections ran out and requests queued 30 s each until pages timed out. More connections, and a short
# wait so a spike fails fast instead of piling up. Tunable without a deploy (Railway variables).
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=int(os.environ.get("DB_POOL_SIZE", "20")),
    max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "30")),
    pool_timeout=int(os.environ.get("DB_POOL_TIMEOUT", "10")),
)

# Startup runs hundreds of additive "ALTER TABLE … ADD COLUMN IF NOT EXISTS" statements. Postgres takes the table's
# exclusive lock even when the column is already there, so on a live database one ALTER queued behind an open request
# and every later read of that table queued behind the ALTER — the whole shop hung. A column that exists skips the
# ALTER entirely, and any other DDL gives up after a few seconds instead of blocking reads.
_ADD_COLUMN = re.compile(
    r'^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"?(\w+)"?\s+ADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\s+"?(\w+)"?',
    re.IGNORECASE,
)
_DDL = re.compile(r"^\s*(ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX)\b", re.IGNORECASE)
DDL_LOCK_TIMEOUT = os.environ.get("DB_DDL_LOCK_TIMEOUT", "5s")


if engine.dialect.name == "postgresql":

    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def _guard_runtime_ddl(conn, cursor, statement, parameters, context, executemany):
        if not _DDL.match(statement):
            return statement, parameters
        m = _ADD_COLUMN.match(statement)
        if m:
            cursor.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = %s AND column_name = %s",
                (m.group(1).lower(), m.group(2).lower()),
            )
            if cursor.fetchone():
                return "SELECT 1", parameters
        cursor.execute(f"SET LOCAL lock_timeout = '{DDL_LOCK_TIMEOUT}'")
        return statement, parameters


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# async on purpose: a sync generator's teardown (db.close) needs a free worker thread, and under load every worker
# sat waiting for a pool connection while every connection sat in a finished request waiting for a thread to close
# it — the API deadlocked until the shop's pages timed out. Closing on the event loop needs no thread.
async def get_db() -> AsyncGenerator[Session, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """Ping database — used by /health and test script."""
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT 1 AS ok")).mappings().one()
            version = conn.execute(text("SELECT version() AS version")).mappings().one()
            dbname = conn.execute(text("SELECT current_database() AS name")).mappings().one()
        return {
            "ok": row["ok"] == 1,
            "version": version["version"],
            "name": dbname["name"],
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
