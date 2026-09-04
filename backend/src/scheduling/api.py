import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from patients.service import PatientNotFoundError
from scheduling.schemas import AppointmentCreate, AppointmentRead, AppointmentWithPatient
from scheduling.service import SchedulingError, SchedulingService
from shared.auth import CurrentUser, Role, require_role
from shared.db import get_db_session

router = APIRouter(prefix="/appointments", tags=["scheduling"])

# Scheduling is clinic ops' day-to-day job; admins can do it too — see ADR-0004.
_OPS_OR_ADMIN = require_role(Role.CLINIC_OPS, Role.ADMIN)


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def schedule_appointment(
    data: AppointmentCreate,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_OPS_OR_ADMIN),
) -> AppointmentRead:
    service = SchedulingService(db)
    try:
        appointment = service.schedule_appointment(data, actor_subject=user.subject)
    except PatientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found") from exc
    except SchedulingError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return AppointmentRead.model_validate(appointment)


@router.get("/patient/{patient_id}", response_model=list[AppointmentWithPatient])
def list_patient_appointments(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_OPS_OR_ADMIN),
) -> list[AppointmentWithPatient]:
    service = SchedulingService(db)
    try:
        return service.get_patient_appointments(patient_id, actor_subject=user.subject)
    except PatientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found") from exc
