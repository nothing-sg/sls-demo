# ADR-0002: Aurora Serverless v2 Postgres, shared cluster with module-owned tables

## Status

Accepted — 2026-09-04

## Context

Clinical data (Patients, Encounters, Appointments) is highly relational: scheduling logic needs to join across Patient and Provider, reporting needs multi-table queries, and referential integrity (a Patient can't be deleted while Appointments reference them) matters more than raw write throughput. This ruled out DynamoDB as the primary store. The question left was whether each module gets its own database/cluster, or all modules share one.

Given the modular-monolith decision in ADR-0001 (one deployable unit, one IAM role), a separate cluster per module would add cost and operational surface without a corresponding isolation benefit — the Lambda already has access to all of them.

## Decision

One **Aurora Serverless v2 (Postgres)** cluster, one database, in a private VPC subnet. Each module owns a subset of tables (e.g. `patients` module owns `patients`, `scheduling` owns `appointments`/`providers`, `audit` owns `audit_log`).

Enforcement is at the code layer, not the database layer: only a module's own `repository.py` may issue SQL against its tables. Other modules that need that data call the owning module's `service.py`. Foreign keys between module-owned tables (e.g. `appointments.patient_id → patients.id`) are allowed at the schema level for integrity, but application code never joins across module ownership lines directly — the `scheduling` module fetches Patient data by calling `patients.service`, not by joining in SQL.

Migrations are managed with Alembic (`backend/src/migrations/`), one migration history for the whole database; each migration is attributable to the module that owns the tables it touches.

## Consequences

- Simple operationally: one cluster to encrypt (KMS), back up, patch, and put in the HITRUST evidence pack.
- The "no cross-module joins in code" rule is a convention, not a database constraint — needs to be caught in code review / `/code-review`, not by the database.
- If a future module has a genuinely different compliance boundary (e.g. handles data under a separate BAA with different retention rules), reopen this ADR — that module may need its own cluster, which ADR-0001 already anticipates as an extraction path.
