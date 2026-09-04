# ADR-0003: PHI-safe structured logging, OpenAPI as the frontend contract, and a dedicated audit-trail module

## Status

Accepted — 2026-09-04

## Context

Three related decisions came out of the same conversation and share a rationale (HIPAA + HITRUST CSF baseline), so they're recorded together.

1. **Logging**: Lambda logs go to CloudWatch by default. Naive logging (e.g. `logger.info(f"Updated patient {patient}")`) would put PHI in a log store that isn't access-controlled the same way the primary database is — a common HIPAA audit finding.
2. **Frontend contract**: the backend is Python/FastAPI, the frontend is React/TypeScript. There's no single language spanning both, so there's no way to get compile-time-checked, end-to-end type safety across the boundary for free (the kind a same-language RPC layer would give).
3. **Audit trail**: HIPAA's Security Rule (§164.312(b)) requires audit controls that record access to PHI — who viewed or changed what, when. This needs to be systematic, not something each module remembers to do ad hoc.

## Decision

**Logging**: `backend/src/shared/logging.py` provides a structured JSON logger with a redaction filter that strips known PHI field names (patient name, MRN, DOB, address, phone, email, SSN) before anything reaches CloudWatch. Modules log `patient_id` (an opaque UUID), never the fields above. This is enforced by convention plus the filter as a backstop, not a guarantee — code review should still catch a raw PHI field passed into a log call.

**Frontend contract**: FastAPI generates an OpenAPI schema from the Pydantic models in each module's `schemas.py`. The frontend generates its typed API client from that schema (`openapi-typescript`) rather than hand-writing fetch calls. This gets most of the benefit a same-language RPC layer would (typed requests/responses, drift caught at build time when the schema changes) while also producing a standalone OpenAPI document — useful as the interface specification HITRUST assessors expect for an in-scope system, which a same-language RPC layer would not have produced.

**Audit trail**: a dedicated `audit` module (`backend/src/audit/`) owns the `audit_log` table and exposes `record_access()` / `record_change()`. Every other module's `service.py` calls into it whenever it reads or writes a PHI-bearing record. This is the one sanctioned exception to "modules don't call each other's internals" (ADR-0001) — `audit` is infrastructure every module depends on, like `shared/`.

## Consequences

- CloudWatch log group can use a shorter/standard retention policy since it's not a PHI store; the audit trail (Postgres `audit_log` table) is the actual HIPAA-relevant record and gets the 6-year retention policy instead.
- The OpenAPI-generated client needs a `make gen-api` (or equivalent CI step) to stay in sync — if the backend schema changes and the frontend client isn't regenerated, the mismatch is a runtime error, not a compile error, until regeneration happens. Wire this into CI (`.github/workflows/ci.yml`) as a drift check.
- Forgetting to call `audit.record_access()` in a new module's `service.py` is a silent compliance gap, not a crash — worth a checklist item in code review for any PR touching a module that reads/writes PHI.
