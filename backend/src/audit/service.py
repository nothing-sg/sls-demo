from sqlalchemy.orm import Session

from audit.models import AuditLogEntry


def record_access(
    db: Session,
    *,
    actor_subject: str,
    resource_type: str,
    resource_id: str,
    reason: str | None = None,
) -> None:
    """Call whenever a module reads a PHI-bearing record. Required by
    HIPAA §164.312(b); see ADR-0003. This is the one module every other
    module is expected to call into directly (not just via `shared`).
    """
    db.add(
        AuditLogEntry(
            actor_subject=actor_subject,
            action="access",
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
        )
    )
    db.commit()


def record_change(
    db: Session,
    *,
    actor_subject: str,
    action: str,
    resource_type: str,
    resource_id: str,
    reason: str | None = None,
) -> None:
    """Call whenever a module creates, updates, or deletes a PHI-bearing record."""
    if action not in {"create", "update", "delete"}:
        raise ValueError(f"invalid audit action: {action!r}")

    db.add(
        AuditLogEntry(
            actor_subject=actor_subject,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
        )
    )
    db.commit()
