import uuid

from sqlalchemy.orm import Session

from audit import service as audit_service
from patients.service import PatientService
from scheduling.models import Appointment
from scheduling.repository import AppointmentRepository
from scheduling.schemas import AppointmentCreate, AppointmentWithPatient


class SchedulingError(Exception):
    pass


class SchedulingService:
    """Public entrypoint for the `scheduling` module. Reaches `patients` data
    only through PatientService — never through patients.repository or a SQL
    join across the two modules' tables (see ADR-0001, ADR-0002).
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AppointmentRepository(db)
        self._patients = PatientService(db)

    def schedule_appointment(self, data: AppointmentCreate, *, actor_subject: str) -> Appointment:
        patient = self._patients.get_patient(data.patient_id, actor_subject=actor_subject)
        if not patient.is_active:
            raise SchedulingError(f"patient {data.patient_id} is not active")

        appointment = self._repo.create(data)
        audit_service.record_change(
            self._db,
            actor_subject=actor_subject,
            action="create",
            resource_type="appointment",
            resource_id=str(appointment.id),
        )
        return appointment

    def get_patient_appointments(
        self, patient_id: uuid.UUID, *, actor_subject: str
    ) -> list[AppointmentWithPatient]:
        summary = self._patients.get_patient_summary(patient_id, actor_subject=actor_subject)
        appointments = self._repo.list_for_patient(patient_id)

        audit_service.record_access(
            self._db,
            actor_subject=actor_subject,
            resource_type="appointment",
            resource_id=f"list_for_patient:{patient_id}",
        )

        return [
            AppointmentWithPatient(
                id=appt.id,
                patient_id=appt.patient_id,
                provider_id=appt.provider_id,
                scheduled_at=appt.scheduled_at,
                status=appt.status,
                patient=summary,
            )
            for appt in appointments
        ]
