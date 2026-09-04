from fastapi.testclient import TestClient


def test_admin_can_list_audit_log(
    client: TestClient, clinic_ops_headers: dict[str, str], admin_headers: dict[str, str]
) -> None:
    client.post(
        "/patients",
        json={
            "mrn": "MRN-200",
            "first_name": "Katherine",
            "last_name": "Johnson",
            "date_of_birth": "1918-08-26",
        },
        headers=clinic_ops_headers,
    )

    response = client.get("/audit-log", headers=admin_headers)
    assert response.status_code == 200
    entries = response.json()
    assert any(e["resource_type"] == "patient" and e["action"] == "create" for e in entries)
    # the audit trail records who acted, not just what happened
    assert any(e["actor_subject"] == "test-clinic-ops" for e in entries)


def test_clinic_ops_cannot_list_audit_log(
    client: TestClient, clinic_ops_headers: dict[str, str]
) -> None:
    response = client.get("/audit-log", headers=clinic_ops_headers)
    assert response.status_code == 403
