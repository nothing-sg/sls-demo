import json
from collections.abc import Generator
from functools import lru_cache

import boto3
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shared.config import get_settings


def _resolve_database_url() -> str:
    settings = get_settings()

    if not settings.database_secret_arn:
        # Local dev: no Secrets Manager, use plain env-configured Postgres.
        return (
            f"postgresql+psycopg://app:app@{settings.database_host}:"
            f"{settings.database_port}/{settings.database_name}"
        )

    client = boto3.client("secretsmanager")
    secret = json.loads(
        client.get_secret_value(SecretId=settings.database_secret_arn)["SecretString"]
    )
    return (
        f"postgresql+psycopg://{secret['username']}:{secret['password']}@"
        f"{secret['host']}:{secret['port']}/{secret['dbname']}"
    )


@lru_cache
def get_engine() -> Engine:
    # Cached at module scope so a warm Lambda invocation reuses the
    # connection pool instead of reconnecting on every request.
    return create_engine(_resolve_database_url(), pool_pre_ping=True, pool_size=1, max_overflow=0)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session, closes it after the request."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
