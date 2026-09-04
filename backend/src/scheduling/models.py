import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shared.models import Base, TimestampMixin, uuid_pk


class Provider(Base, TimestampMixin):
    __tablename__ = "providers"

    id: Mapped[uuid.UUID] = uuid_pk()
    first_name: Mapped[str] = mapped_column(String(128))
    last_name: Mapped[str] = mapped_column(String(128))
    specialty: Mapped[str] = mapped_column(String(128))


class Appointment(Base, TimestampMixin):
    """Owned by this module. `patient_id` is a foreign key for referential
    integrity (ADR-0002), but application code never joins into `patients`
    directly — scheduling.service calls patients.service instead.
    """

    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = uuid_pk()
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    provider_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
