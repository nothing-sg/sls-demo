# CONTEXT

Domain glossary for sls-best-practice. Single-context repo — see `docs/agents/domain.md` for how agents should use this file, and `docs/adr/` for the decisions behind it.

## Core entities

- **Patient**: the person receiving care. Identified internally by `patient_id` (UUID), never by SSN or MRN in logs, URLs, or non-`patients`-module code. Owned entirely by the `patients` module.
- **MRN (Medical Record Number)**: the patient's identifier in the source-of-truth clinical system. Treated as PHI. Never logged; only referenced via `patient_id` outside the `patients` module.
- **Provider**: a clinician who can be scheduled for or associated with an Encounter. Owned by the `scheduling` module.
- **Encounter**: a single clinical interaction between a Patient and a Provider (a visit, a telehealth call, a procedure). Always "Encounter" — never "Visit" or "Session" (see ADR conflict-flagging rule in `docs/agents/domain.md`).
- **Appointment**: a scheduled future Encounter that hasn't happened yet. An Appointment becomes (is linked to) an Encounter once it occurs; it is not the same record.
- **PHI (Protected Health Information)**: any data element that could identify a patient in combination with health information, per HIPAA's 18 identifiers. Drives the redaction rules in `shared/logging.py` (ADR-0003).
- **Audit Trail**: the immutable log of who accessed or changed what PHI, when, and why. Written by the `audit` module; every module's `service.py` calls into it on read and write of PHI-bearing records. Required by the HIPAA Security Rule (§164.312(b)) and HITRUST CSF.
- **Minimum Necessary**: the HIPAA principle that a role should see only the PHI required for its task. Drives per-field authorization checks in each module's `service.py`, not just per-endpoint auth.
- **Module** (this repo's sense): a bounded unit of code under `backend/src/<module>/` that owns a set of tables and exposes access only through its `service.py`. Not a bounded context in the DDD/multi-repo sense — see ADR-0001 for why this repo stays single-context despite having multiple modules.

## Terms explicitly avoided

- "Visit" — use **Encounter**.
- "User" for a patient-facing person — use **Patient**; reserve "User" for internal staff accounts if that concept is introduced later.
- "Record" alone — ambiguous between a database row and a clinical record; say **Patient record**, **Encounter record**, etc.

## Gaps

None yet — this glossary was seeded at project scaffolding time (`/setup-matt-pocock-skills`, 2026-09-04) alongside the initial modules (`patients`, `scheduling`, `audit`). Expect `/domain-modeling` to expand this as real features land.
