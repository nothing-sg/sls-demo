import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def uuid_pk() -> Mapped[uuid.UUID]:
    # sqlalchemy.Uuid (not the postgres-dialect UUID type) compiles to native
    # UUID on Postgres but also round-trips correctly under SQLite, which the
    # unit test harness uses in place of Postgres (see tests/conftest.py).
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
