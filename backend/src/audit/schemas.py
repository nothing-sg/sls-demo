import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    actor_subject: str
    action: str
    resource_type: str
    resource_id: str
    reason: str | None
