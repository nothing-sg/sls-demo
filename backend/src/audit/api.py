from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from audit import service as audit_service
from audit.schemas import AuditLogEntryRead
from shared.auth import CurrentUser, Role, require_role
from shared.db import get_db_session

router = APIRouter(prefix="/audit-log", tags=["audit"])

_ADMIN_ONLY = require_role(Role.ADMIN)


@router.get("", response_model=list[AuditLogEntryRead])
def list_audit_log(
    db: Session = Depends(get_db_session),
    _user: CurrentUser = Depends(_ADMIN_ONLY),
) -> list[AuditLogEntryRead]:
    entries = audit_service.list_recent(db)
    return [AuditLogEntryRead.model_validate(e) for e in entries]
