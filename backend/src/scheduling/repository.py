import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from scheduling.models import Appointment
from scheduling.schemas import AppointmentCreate


class AppointmentRepository:
    """The only code allowed to issue SQL against `appointments`/`providers`."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, appointment_id: uuid.UUID) -> Appointment | None:
        return self._db.get(Appointment, appointment_id)

    def list_for_patient(self, patient_id: uuid.UUID) -> list[Appointment]:
        stmt = select(Appointment).where(Appointment.patient_id == patient_id)
        return list(self._db.scalars(stmt))

    def create(self, data: AppointmentCreate) -> Appointment:
        appointment = Appointment(**data.model_dump())
        self._db.add(appointment)
        self._db.commit()
        self._db.refresh(appointment)
        return appointment
