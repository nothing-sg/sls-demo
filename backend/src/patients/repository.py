import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from patients.models import Patient
from patients.schemas import PatientCreate


class PatientRepository:
    """The only code allowed to issue SQL against the `patients` table."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, patient_id: uuid.UUID) -> Patient | None:
        return self._db.get(Patient, patient_id)

    def list_active(self, *, limit: int = 50) -> list[Patient]:
        stmt = select(Patient).where(Patient.is_active.is_(True)).limit(limit)
        return list(self._db.scalars(stmt))

    def create(self, data: PatientCreate) -> Patient:
        patient = Patient(**data.model_dump())
        self._db.add(patient)
        self._db.commit()
        self._db.refresh(patient)
        return patient
