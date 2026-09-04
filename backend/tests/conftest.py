import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from audit import models as _audit_models  # noqa: F401  imported for Base.metadata side effect
from patients import models as _patients_models  # noqa: F401
from scheduling import models as _scheduling_models  # noqa: F401
from shared.models import Base


@pytest.fixture()
def db_session() -> Session:
    # In-memory SQLite stands in for Postgres in unit tests — good enough for
    # module-boundary and business-logic tests; migrations are exercised
    # against real Postgres in CI instead (see .github/workflows/ci.yml).
    #
    # The model imports above must happen before create_all: each module's
    # tables only register onto Base.metadata as an import side effect, and
    # nothing here otherwise forces patients/scheduling/audit to be imported
    # ahead of `app` (which is imported lazily, inside the `client` fixture).
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from app import app
    from shared.db import get_db_session

    def _override_get_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_get_db_session
    return TestClient(app)


def _bearer_headers(*, subject: str, role: str | None) -> dict[str, str]:
    # get_current_user decodes without verifying signature (dev-mode TODO in
    # shared/auth.py), so any well-formed unsigned JWT with a `sub` works here.
    import jwt

    claims: dict[str, str] = {"sub": subject}
    if role is not None:
        claims["custom:role"] = role
    token = jwt.encode(claims, key="unused", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers() -> dict[str, str]:
    return _bearer_headers(subject="test-admin", role="admin")


@pytest.fixture()
def clinic_ops_headers() -> dict[str, str]:
    return _bearer_headers(subject="test-clinic-ops", role="clinic_ops")


@pytest.fixture()
def no_role_headers() -> dict[str, str]:
    """Authenticated (valid JWT) but no role claim — require_role() must
    reject this the same as an unrecognized role, per shared/auth.py.
    """
    return _bearer_headers(subject="test-no-role", role=None)
