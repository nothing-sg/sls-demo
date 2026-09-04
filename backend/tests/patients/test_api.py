from fastapi.testclient import TestClient


def test_register_and_get_patient(client: TestClient, auth_headers: dict[str, str]) -> None:
    create_response = client.post(
        "/patients",
        json={
            "mrn": "MRN-001",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "date_of_birth": "1990-01-01",
        },
        headers=auth_headers,
    )
    assert create_response.status_code == 201
    patient_id = create_response.json()["id"]

    get_response = client.get(f"/patients/{patient_id}", headers=auth_headers)
    assert get_response.status_code == 200
    assert get_response.json()["mrn"] == "MRN-001"


def test_get_unknown_patient_returns_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/patients/00000000-0000-0000-0000-000000000000", headers=auth_headers)
    assert response.status_code == 404


def test_requires_auth(client: TestClient) -> None:
    response = client.get("/patients")
    assert response.status_code == 401
