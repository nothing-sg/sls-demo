# sls-best-practice

Serverless modular monolith for a healthcare application. See [`AGENTS.md`](./AGENTS.md) for the full stack, module layout, and agent-skill configuration; [`CONTEXT.md`](./CONTEXT.md) for the domain glossary; [`docs/adr/`](./docs/adr/) for the architecture decisions.

## Stack

- **Backend**: Python 3.12 / FastAPI / SQLAlchemy, one Lambda behind API Gateway (`backend/`)
- **Frontend**: React 19 + TypeScript + Vite, shadcn/ui, TanStack Query + Table, react-router-dom, Cognito SRP auth, static-hosted on S3/CloudFront (`frontend/`) — see ADR-0005
- **Data**: Aurora Serverless v2 (Postgres)
- **IaC**: AWS SAM (`infra/`)
- **Compliance**: HIPAA + HITRUST CSF baseline

## Getting started

```bash
make backend-install    # uv sync
make frontend-install   # npm install
make backend-run        # FastAPI dev server on :8000 (starts local Postgres first)
make frontend-run       # vite dev server on :5173, proxies /api -> :8000
```

Run everything the CI pipeline runs locally with `make test lint`.

## API docs

FastAPI serves interactive docs automatically: Swagger UI at `/docs`, ReDoc at `/redoc`, and the raw schema at `/openapi.json` (with `backend-run` above, that's `http://localhost:8000/docs`). On the deployed API these three routes are intentionally left open to any caller — see `infra/modules/api.yaml` — while every other route requires a Cognito JWT; they only describe endpoint shapes, no PHI, and are the interface spec HITRUST assessors expect for an in-scope system (ADR-0003).

## Frontend

`make frontend-run` serves the app at `http://localhost:5173`, proxying `/api` to the backend on `:8000`. It needs a real, deployed Cognito User Pool to actually sign in — copy `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` from `sam deploy`'s outputs into `frontend/.env.local` (see `frontend/.env.example`). Without them, the app still loads and redirects to `/login` correctly — it just can't complete a sign-in, and says so in the form rather than crashing.

For local sign-in testing without a deployed Cognito User Pool at all, run `make auth-run` — see `local/cognito/README.md` for the local auth server, seeded test accounts, and known local-vs-production gaps.

Staff accounts are admin-provisioned (`aws cognito-idp admin-create-user`), not self-service — first sign-in always goes through Cognito's "set a new password" step, which the login page handles.

After changing a backend endpoint or Pydantic schema, run `make gen-api` to regenerate `frontend/src/api/schema.d.ts` — CI fails the build if you forget (see ADR-0003, ADR-0005).

## Roles (RBAC)

Every route except `/health`, `/docs`, `/redoc`, `/openapi.json` requires a Cognito JWT with a `custom:role` claim of `admin` or `clinic_ops` — see ADR-0004. Signature verification against Cognito's JWKS is still a TODO (`backend/src/shared/auth.py`), so for local testing any unsigned JWT with `sub` and `custom:role` claims works:

```python
import jwt
token = jwt.encode({"sub": "local-dev", "custom:role": "admin"}, key="unused", algorithm="HS256")
```

`admin` can do everything `clinic_ops` can, plus `POST /patients/{id}/deactivate` and `GET /audit-log`.

## Local database

`make db-up` starts a local Postgres in Docker (`docker-compose.yml`), matching the connection the backend defaults to when no `APP_DATABASE_SECRET_ARN` is set (see `backend/src/shared/config.py` / `db.py`) — `make backend-run` already depends on `db-up`, so you don't normally need to run it yourself. Data persists in a named Docker volume across restarts; apply migrations once after the first start (and again after pulling new ones):

```bash
cd backend && uv run alembic upgrade head
```

`make db-down` stops the container without deleting its data. To point at a Postgres you're managing yourself instead, override `APP_DATABASE_HOST`/`APP_DATABASE_PORT`/`APP_DATABASE_NAME` and skip `make db-up` entirely. See [ADR-0008](./docs/adr/0008-local-dev-docker-compose.md) for why this is Docker-based rather than a "bring your own Postgres" instruction.

## Deploying

```bash
make sam-build
cd infra && sam deploy --guided --parameter-overrides file://env/dev.json
```

See `infra/template.yaml` for the stack layout (network / data / api / frontend / audit, one nested stack per infrastructure layer — see ADR-0001 for why layers, not business modules).
