from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from shared.config import get_settings


@dataclass(frozen=True)
class CurrentUser:
    subject: str
    role: str
    raw_claims: dict


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    """FastAPI dependency: verifies the Cognito-issued JWT on every request.

    Signature verification against the User Pool's JWKS is deliberately left
    as a TODO for the real Cognito setup (infra/modules/api.yaml creates the
    User Pool) — this decodes the claims shape so modules can build against
    `CurrentUser` now.
    """
    settings = get_settings()
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.removeprefix("Bearer ")
    try:
        claims = jwt.decode(
            token,
            options={"verify_signature": False},  # TODO: verify against Cognito JWKS
            audience=settings.cognito_app_client_id or None,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    return CurrentUser(
        subject=claims["sub"],
        role=claims.get("custom:role", "staff"),
        raw_claims=claims,
    )
