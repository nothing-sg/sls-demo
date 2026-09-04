import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class PatientCreate(BaseModel):
    mrn: str
    first_name: str
    last_name: str
    date_of_birth: date


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mrn: str
    first_name: str
    last_name: str
    date_of_birth: date
    is_active: bool


class PatientSummary(BaseModel):
    """The minimum-necessary view for other modules (e.g. scheduling) —
    deliberately excludes MRN and DOB. Returned by patients.service, never
    by the repository directly, so other modules can't accidentally reach
    for the fuller PatientRead shape.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    is_active: bool
