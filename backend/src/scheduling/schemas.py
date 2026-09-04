import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from patients.schemas import PatientSummary


class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    provider_id: uuid.UUID
    scheduled_at: datetime


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    provider_id: uuid.UUID
    scheduled_at: datetime
    status: str


class AppointmentWithPatient(AppointmentRead):
    """Composed by scheduling.service from AppointmentRead + a PatientSummary
    fetched via patients.service — never by joining tables directly.
    """

    patient: PatientSummary
