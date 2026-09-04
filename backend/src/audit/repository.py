from sqlalchemy import select
from sqlalchemy.orm import Session

from audit.models import AuditLogEntry


class AuditRepository:
    """The only code allowed to issue SQL against `audit_log`. Read-only on
    purpose — writes go through record_access/record_change in service.py,
    and there is deliberately no update/delete path anywhere in this module.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def list_recent(self, *, limit: int = 100) -> list[AuditLogEntry]:
        stmt = select(AuditLogEntry).order_by(AuditLogEntry.occurred_at.desc()).limit(limit)
        return list(self._db.scalars(stmt))
