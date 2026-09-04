# sls-best-practice

Serverless modular monolith for a healthcare application. See [`AGENTS.md`](./AGENTS.md) for the full stack, module layout, and agent-skill configuration; [`CONTEXT.md`](./CONTEXT.md) for the domain glossary; [`docs/adr/`](./docs/adr/) for the architecture decisions.

## Stack

- **Backend**: Python 3.12 / FastAPI / SQLAlchemy, one Lambda behind API Gateway (`backend/`)
- **Frontend**: React + TypeScript + Vite, static-hosted on S3/CloudFront (`frontend/`)
- **Data**: Aurora Serverless v2 (Postgres)
- **IaC**: AWS SAM (`infra/`)
- **Compliance**: HIPAA + HITRUST CSF baseline

## Getting started

```bash
make backend-install    # uv sync
make frontend-install   # npm install
make backend-run        # FastAPI dev server on :8000
make frontend-build     # vite dev server is `cd frontend && npm run dev`, proxies /api -> :8000
```

Run everything the CI pipeline runs locally with `make test lint`.

## Local database

The backend defaults to a local Postgres at `localhost:5432` (see `backend/src/shared/config.py`) when no `APP_DATABASE_SECRET_ARN` is set. Point `APP_DATABASE_HOST`/`APP_DATABASE_PORT`/`APP_DATABASE_NAME` at whatever local Postgres you run; apply migrations with:

```bash
cd backend && uv run alembic upgrade head
```

## Deploying

```bash
make sam-build
cd infra && sam deploy --guided --parameter-overrides file://env/dev.json
```

See `infra/template.yaml` for the stack layout (network / data / api / frontend / audit, one nested stack per infrastructure layer — see ADR-0001 for why layers, not business modules).
