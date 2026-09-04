import uuid
from datetime import date

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column

from shared.models import Base, TimestampMixin, uuid_pk


class Patient(Base, TimestampMixin):
    """Owned exclusively by this module. No other module's repository.py
    may query this table directly — go through patients.service instead
    (see ADR-0002).
    """

    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = uuid_pk()
    mrn: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(128))
    last_name: Mapped[str] = mapped_column(String(128))
    date_of_birth: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(default=True)
