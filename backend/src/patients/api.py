import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from patients.schemas import PatientCreate, PatientRead
from patients.service import PatientNotFoundError, PatientService
from shared.auth import CurrentUser, get_current_user
from shared.db import get_db_session

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientRead])
def list_patients(
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
) -> list[PatientRead]:
    service = PatientService(db)
    patients = service.list_active_patients(actor_subject=user.subject)
    return [PatientRead.model_validate(p) for p in patients]


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db_session),
    user: CurrentUser = Depends(get_current_user),
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
    user: CurrentUser = Depends(get_current_user),
) -> PatientRead:
    service = PatientService(db)
    patient = service.register_patient(data, actor_subject=user.subject)
    return PatientRead.model_validate(patient)
