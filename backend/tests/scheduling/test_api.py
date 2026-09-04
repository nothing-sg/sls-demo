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
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, auth_headers)

    response = client.post(
        "/appointments",
        json={
            "patient_id": patient_id,
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["patient_id"] == patient_id


def test_schedule_appointment_for_unknown_patient_fails(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.post(
        "/appointments",
        json={
            "patient_id": "00000000-0000-0000-0000-000000000000",
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_list_patient_appointments_includes_patient_summary(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, auth_headers)
    client.post(
        "/appointments",
        json={
            "patient_id": patient_id,
            "provider_id": "11111111-1111-1111-1111-111111111111",
            "scheduled_at": datetime.now(UTC).isoformat(),
        },
        headers=auth_headers,
    )

    response = client.get(f"/appointments/patient/{patient_id}", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["patient"]["first_name"] == "Grace"
    assert "mrn" not in body[0]["patient"]  # minimum-necessary: PatientSummary excludes MRN
