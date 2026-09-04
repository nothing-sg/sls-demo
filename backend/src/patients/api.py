import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from patients.schemas import PatientCreate, PatientRead
from patients.service import PatientNotFoundError, PatientService
from shared.auth import CurrentUser, Role, require_role
from shared.db import get_db_session

router = APIRouter(prefix="/patients", tags=["patients"])

# Day-to-day patient lookup/registration is clinic ops' job; admins can do it
# too. Only deactivation (below) is admin-only — see ADR-0004.
_OPS_OR_ADMIN = require_role(Role.CLINIC_OPS, Role.ADMIN)
_ADMIN_ONLY = require_role(Role.ADMIN)


@router.get("", response_model=list[PatientRead])
def list_patients(
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_OPS_OR_ADMIN),
) -> list[PatientRead]:
    service = PatientService(db)
    patients = service.list_active_patients(actor_subject=user.subject)
    return [PatientRead.model_validate(p) for p in patients]


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_OPS_OR_ADMIN),
) -> PatientRead:
    service = PatientService(db)
    try:
        patient = service.get_patient(patient_id, actor_subject=user.subject)
    except PatientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found") from exc
    return PatientRead.model_validate(patient)


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def register_patient(
    data: PatientCreate,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_OPS_OR_ADMIN),
) -> PatientRead:
    service = PatientService(db)
    patient = service.register_patient(data, actor_subject=user.subject)
    return PatientRead.model_validate(patient)


@router.post("/{patient_id}/deactivate", response_model=PatientRead)
def deactivate_patient(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(_ADMIN_ONLY),
) -> PatientRead:
    service = PatientService(db)
    try:
        patient = service.deactivate_patient(patient_id, actor_subject=user.subject)
    except PatientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found") from exc
    return PatientRead.model_validate(patient)
