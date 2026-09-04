from datetime import UTC, datetime

from fastapi.testclient import TestClient


def _register_patient(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/patients",
        json={
            "mrn": "MRN-100",
            "first_name": "Grace",
            "last_name": "Hopper",
            "date_of_birth": "1985-06-15",
        },
        headers=headers,
    )
    return response.json()["id"]


def test_schedule_appointment_for_active_patient(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)

    response = client.post(
        "/appointments",
        json={
            "patient_id": patient_id,
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=clinic_ops_headers,
    )
    assert response.status_code == 201
    assert response.json()["patient_id"] == patient_id


def test_schedule_appointment_for_unknown_patient_fails(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    response = client.post(
        "/appointments",
        json={
            "patient_id": "00000000-0000-0000-0000-000000000000",
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=clinic_ops_headers,
    )
    assert response.status_code == 404


def test_list_patient_appointments_includes_patient_summary(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)
    client.post(
        "/appointments",
        json={
            "patient_id": patient_id,
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=clinic_ops_headers,
    )

    response = client.get(f"/appointments/patient/{patient_id}", headers=clinic_ops_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["patient"]["first_name"] == "Grace"
    assert "mrn" not in body[0]["patient"]  # minimum-necessary: PatientSummary excludes MRN


def test_admin_can_also_schedule_appointments(
    client: TestClient, clinic_ops_headers: dict[str, str], admin_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)

    response = client.post(
        "/appointments",
        json={
            "patient_id": patient_id,
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=admin_headers,
    )
    assert response.status_code == 201


def test_scheduling_requires_a_recognized_role(
    client: TestClient, no_role_headers: dict[str, str]
) -> None:
    response = client.post(
        "/appointments",
        json={
            "patient_id": "00000000-0000-0000-0000-000000000000",
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=no_role_headers,
    )
    assert response.status_code == 403
