import uuid

from sqlalchemy.orm import Session

from audit import service as audit_service
from patients.models import Patient
from patients.repository import PatientRepository
from patients.schemas import PatientCreate, PatientSummary


class PatientNotFoundError(Exception):
    pass


class PatientService:
    """Public entrypoint for the `patients` module. Other modules (e.g.
    scheduling) call this, never patients.repository or patients.models
    directly — see AGENTS.md and ADR-0001.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = PatientRepository(db)

    def get_patient(self, patient_id: uuid.UUID, *, actor_subject: str) -> Patient:
        patient = self._repo.get(patient_id)
        if patient is None:
            raise PatientNotFoundError(str(patient_id))

        audit_service.record_access(
            self._db,
            actor_subject=actor_subject,
            resource_type="patient",
            resource_id=str(patient_id),
        )
        return patient

    def get_patient_summary(self, patient_id: uuid.UUID, *, actor_subject: str) -> PatientSummary:
        """Minimum-necessary view for other modules — see PatientSummary."""
        patient = self.get_patient(patient_id, actor_subject=actor_subject)
        return PatientSummary.model_validate(patient)

    def list_active_patients(self, *, actor_subject: str) -> list[Patient]:
        patients = self._repo.list_active()
        audit_service.record_access(
            self._db,
            actor_subject=actor_subject,
            resource_type="patient",
            resource_id="list_active",
            reason="list view",
        )
        return patients

    def register_patient(self, data: PatientCreate, *, actor_subject: str) -> Patient:
        patient = self._repo.create(data)
        audit_service.record_change(
            self._db,
            actor_subject=actor_subject,
            action="create",
            resource_type="patient",
            resource_id=str(patient.id),
        )
        return patient

    def deactivate_patient(self, patient_id: uuid.UUID, *, actor_subject: str) -> Patient:
        """Admin-only (see patients.api / ADR-0004) — front-desk staff register
        and look up patients but don't deactivate records.
        """
        patient = self._repo.get(patient_id)
        if patient is None:
            raise PatientNotFoundError(str(patient_id))

        patient = self._repo.deactivate(patient)
        audit_service.record_change(
            self._db,
            actor_subject=actor_subject,
            action="update",
            resource_type="patient",
            resource_id=str(patient_id),
            reason="deactivate",
        )
        return patient
