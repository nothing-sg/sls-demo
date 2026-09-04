# ADR-0004: RBAC with two roles — admin and clinic_ops

## Status

Accepted — 2026-09-04

## Context

The app has no authorization model yet — `get_current_user` (shared/auth.py) verifies a Cognito JWT but every authenticated caller can hit every endpoint. That's inconsistent with the Minimum Necessary principle already in the glossary (CONTEXT.md) and gives no way to separate day-to-day clinic work from administrative/compliance actions like deactivating a patient record or reading the HIPAA access-log audit trail.

The realistic set of people using this system at this stage is small: front-desk/scheduling staff doing the actual clinic work, and admins who provision accounts, correct records, and are accountable to auditors. A fine-grained permission system (per-field, per-resource ACLs) is more machinery than two roles justifies right now.

## Decision

Two roles, both defined in `shared/auth.py` as `Role.ADMIN` and `Role.CLINIC_OPS`:

- **`clinic_ops`**: day-to-day clinic operations — register/look up patients, schedule/view appointments. This is the majority of traffic and the majority of endpoints.
- **`admin`**: everything `clinic_ops` can do, plus administrative/compliance actions: deactivate a patient record (`POST /patients/{id}/deactivate`), read the audit trail (`GET /audit-log`). Endpoints don't otherwise distinguish — an endpoint is either open to both roles or admin-only; there's no third tier yet.

The role comes from the Cognito `custom:role` user attribute (`infra/modules/api.yaml` declares the schema; it's set by an admin via `admin-update-user-attributes`, never through a self-service flow — a self-service role field would let any authenticated user grant themselves `admin`). `shared/auth.get_current_user` parses it into `CurrentUser.role: Role | None`; a missing or unrecognized value becomes `None`, not a default role.

Authorization is enforced with `shared/auth.require_role(*allowed)`, a dependency factory used as `Depends(require_role(Role.ADMIN))` (or `Depends(require_role(Role.CLINIC_OPS, Role.ADMIN))`) on each route. It **fails closed**: `None` never matches any `allowed` set, so a missing or unrecognized role claim is rejected (403) exactly like a role that's valid but not permitted — there is no implicit default-open role, unlike the placeholder `"staff"` default this replaces.

## Consequences

- Adding a new endpoint means picking a `require_role(...)` set deliberately — there's no fallback dependency that grants blanket access, so forgetting it is a hard 401/500, not a silent over-grant.
- A third role (e.g. a clinician role with read access to clinical notes but not scheduling) is a straightforward addition to the `Role` enum plus new `require_role(...)` sets on the relevant endpoints — this is intentionally not designed to prevent that, just not built ahead of an actual need.
- JWT signature verification against Cognito's JWKS is still a TODO (see `shared/auth.py`) — until that lands, `role` (like every other claim) is trusted from an unverified token. RBAC enforcement is real once that TODO closes; it's scaffolding until then.
- The audit trail records every admin action taken (`audit.record_change` with `reason="deactivate"`, etc.), so "who changed a patient's status and when" is answerable from `GET /audit-log`, not just "that it happened."
