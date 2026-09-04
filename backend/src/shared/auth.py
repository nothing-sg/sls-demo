from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

import jwt
from fastapi import Depends, Header, HTTPException, status

from shared.config import get_settings


class Role(StrEnum):
    """Canonical RBAC roles. Sourced from the Cognito `custom:role` claim,
    set on the user at provisioning time (not self-service) — see
    infra/modules/api.yaml. See ADR-0004 for what each role can do.
    """

    ADMIN = "admin"
    CLINIC_OPS = "clinic_ops"


@dataclass(frozen=True)
class CurrentUser:
    subject: str
    role: Role | None
    raw_claims: dict[str, object]


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    """FastAPI dependency: verifies the Cognito-issued JWT on every request.

    Signature verification against the User Pool's JWKS is deliberately left
    as a TODO for the real Cognito setup (infra/modules/api.yaml creates the
    User Pool) — this decodes the claims shape so modules can build against
    `CurrentUser` now.

    Authentication only — this does not check `role`. Use `require_role` on
    endpoints that need authorization, not this dependency directly.
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

    raw_role = claims.get("custom:role")
    try:
        role = Role(raw_role) if raw_role is not None else None
    except ValueError:
        # Unrecognized role string (typo, stale claim, role retired) — treated
        # as no role, which require_role() rejects same as a missing claim.
        role = None

    return CurrentUser(subject=claims["sub"], role=role, raw_claims=claims)


def require_role(*allowed: Role) -> Callable[..., CurrentUser]:
    """FastAPI dependency factory gating an endpoint to specific roles.

    Fails closed: a missing or unrecognized role claim is rejected exactly
    like a role that's valid but not in `allowed` — there is no default-open
    role. Usage: `user: CurrentUser = Depends(require_role(Role.ADMIN))`.
    """

    def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return _check
