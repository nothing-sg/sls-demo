from fastapi.testclient import TestClient


def _register_patient(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/patients",
        json={
            "mrn": "MRN-001",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "date_of_birth": "1990-01-01",
        },
        headers=headers,
    )
    return response.json()["id"]


def test_register_and_get_patient(client: TestClient, clinic_ops_headers: dict[str, str]) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)

    get_response = client.get(f"/patients/{patient_id}", headers=clinic_ops_headers)
    assert get_response.status_code == 200
    assert get_response.json()["mrn"] == "MRN-001"


def test_admin_can_also_register_and_get_patients(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, admin_headers)

    get_response = client.get(f"/patients/{patient_id}", headers=admin_headers)
    assert get_response.status_code == 200


def test_get_unknown_patient_returns_404(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    response = client.get(
        "/patients/00000000-0000-0000-0000-000000000000", headers=clinic_ops_headers
    )
    assert response.status_code == 404


def test_requires_auth(client: TestClient) -> None:
    response = client.get("/patients")
    assert response.status_code == 401


def test_valid_token_without_role_is_forbidden(
    client: TestClient, no_role_headers: dict[str, str]
) -> None:
    response = client.get("/patients", headers=no_role_headers)
    assert response.status_code == 403


def test_admin_can_deactivate_patient(
    client: TestClient, clinic_ops_headers: dict[str, str], admin_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)

    response = client.post(f"/patients/{patient_id}/deactivate", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_clinic_ops_cannot_deactivate_patient(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    patient_id = _register_patient(client, clinic_ops_headers)

    response = client.post(f"/patients/{patient_id}/deactivate", headers=clinic_ops_headers)
    assert response.status_code == 403

    # and the patient was in fact left untouched
    get_response = client.get(f"/patients/{patient_id}", headers=clinic_ops_headers)
    assert get_response.json()["is_active"] is True
