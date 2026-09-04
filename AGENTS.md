# sls-best-practice

A serverless modular monolith for a healthcare application: Python/FastAPI backend on AWS Lambda, React/Vite frontend, deployed with AWS SAM. Built to a HIPAA + HITRUST CSF baseline.

## Stack

- **Backend**: Python 3.12, FastAPI, Pydantic, SQLAlchemy, deployed as a single Lambda behind API Gateway via Mangum. Package/dependency management with `uv`.
- **Frontend**: React + TypeScript + Vite, static-hosted on S3/CloudFront. API client generated from the backend's OpenAPI schema.
- **Data**: Aurora Serverless v2 (Postgres). One shared database; each module owns its own tables and is the only code allowed to query them directly (see ADR-0002).
- **IaC**: AWS SAM (`infra/`), templates organized by infrastructure layer (network, data, api, frontend, audit), not by business module — the app deploys as one Lambda, so business-module boundaries are a source-code concern, not a deployment-unit concern.
- **Compliance baseline**: HIPAA + HITRUST CSF. See ADR-0003 for the logging/audit-trail approach this implies.

## Modular monolith structure

Business modules live under `backend/src/<module>/`, each with the same internal shape:

```
backend/src/<module>/
├── api.py         # FastAPI router — the only public entrypoint
├── schemas.py     # Pydantic request/response models
├── service.py     # business logic, orchestrates repository + audit calls
├── repository.py  # the ONLY code allowed to query this module's tables
└── models.py      # SQLAlchemy ORM models owned by this module
```

`backend/src/shared/` is the cross-module kernel: config, DB session management, structured logging with PHI redaction, and auth. Any module may import from `shared/`; no module may import another module's `repository.py` or `models.py` directly — cross-module access goes through the other module's `service.py`. `backend/src/audit/` is the one exception every module is expected to call into, for HIPAA access logging.

`backend/src/app.py` assembles the FastAPI app from each module's router and wraps it with Mangum for Lambda.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line since the tracker is local markdown. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## PHI handling

Never put real patient data, sample records with real-looking identifiers, or production PHI into this repo — commit history, `.scratch/` issue files, and test fixtures included. Use synthetic data (e.g. Faker-generated) everywhere. See ADR-0003 for the logging redaction rules that assume this.
