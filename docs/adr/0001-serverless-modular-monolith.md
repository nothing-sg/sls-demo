# ADR-0001: Serverless modular monolith on AWS Lambda

## Status

Accepted — 2026-09-04

## Context

The app needs to ship multiple business capabilities (patient records, scheduling, and more later) for a healthcare product under a HIPAA + HITRUST CSF compliance baseline. Two extremes were on the table: a single undifferentiated Lambda/codebase with no internal boundaries, or a full microservices split (one deployable service per business capability, each with its own Lambda(s), API, and possibly its own datastore).

Full microservices adds real cost early: separate deploy pipelines, separate IAM roles and audit surfaces to review for HITRUST, cross-service auth and network paths (more attack surface for PHI), and distributed-transaction handling for anything that spans capabilities (e.g. scheduling an Appointment needs to check Patient eligibility). For a small team building the first version of a healthcare product, that cost isn't justified yet, and every extra network hop is another place PHI can leak or another audit-log gap.

## Decision

Ship as a **serverless modular monolith**: one Lambda function running one FastAPI application (`backend/src/app.py`), with internal module boundaries enforced by source-code convention, not deployment boundaries.

- Business modules live at `backend/src/<module>/`, each owning its own tables and exposing access only through its `service.py` (see `AGENTS.md`).
- Cross-module calls go through the other module's service layer in-process — no HTTP hop, no queue, no separate IAM boundary to audit.
- IaC (`infra/`) is organized by infrastructure layer (network, data, api, frontend, audit), not by business module, because there is only one compute deployment unit.
- If a module later needs independent scaling, independent deployment cadence, or a separate compliance boundary, it can be extracted into its own service — the module boundary already exists in the code, so extraction is a deployment change, not a rewrite.

## Consequences

- One audit surface, one IAM role for the API Lambda, one CloudTrail-relevant deploy pipeline — smaller HITRUST control surface than microservices.
- A bug in one module can still crash the whole Lambda (no process isolation between modules). Mitigated by the repository-layer boundary and by tests per module.
- Cross-module business rules (e.g. "can't schedule an Appointment for an inactive Patient") are enforced via one service calling another's public service method — never by reaching into another module's table.
- Revisit this decision if a module's compliance requirements diverge sharply from the rest (e.g. a future module needs its own BAA-scoped data store) — see the note in ADR-0002.
