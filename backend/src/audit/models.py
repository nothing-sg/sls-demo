import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from shared.models import Base, uuid_pk


class AuditLogEntry(Base):
    """Immutable HIPAA access/change log. Written only via audit.service —
    no UPDATE or DELETE path is exposed anywhere in this module on purpose.
    Retain for 6 years per the HIPAA Security Rule; see infra/modules/data.yaml
    for the bucket/table retention policy.
    """

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = uuid_pk()
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actor_subject: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(32))  # "access" | "create" | "update" | "delete"
    resource_type: Mapped[str] = mapped_column(String(64))  # e.g. "patient", "appointment"
    resource_id: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
