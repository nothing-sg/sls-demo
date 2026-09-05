.PHONY: backend-install backend-test backend-lint backend-run \
        frontend-install frontend-build frontend-test frontend-lint frontend-run \
        gen-api sam-build sam-validate test lint \
        db-up db-down auth-run auth-down

backend-install:
	cd backend && uv sync --group dev

backend-test:
	cd backend && uv run pytest

backend-lint:
	cd backend && uv run ruff check src tests && uv run mypy src

backend-run: db-up
	cd backend && uv run uvicorn app:app --app-dir src --reload

frontend-install:
	cd frontend && npm install

frontend-build:
	cd frontend && npm run build

frontend-test:
	cd frontend && npm run test

frontend-lint:
	cd frontend && npm run lint

frontend-run:
	cd frontend && npm run dev

# Local Postgres for the backend (see backend/src/shared/config.py /
# db.py). Persists data across restarts in a named Docker volume; run
# `cd backend && uv run alembic upgrade head` yourself after the first
# `db-up`. See docker-compose.yml and docs/adr/0008-local-dev-docker-compose.md.
db-up:
	docker compose up -d --wait postgres

db-down:
	docker compose stop postgres

# Local Cognito-compatible auth server (cognito-local, containerized), for
# local sign-in testing without a deployed AWS Cognito User Pool. Opt-in,
# never started by any other target. State is ephemeral: --force-recreate
# guarantees a fresh container (and therefore a wiped cognito-local
# database) on every `make auth-run`, same guarantee the old
# rm -rf local/cognito/.cognito gave. See local/cognito/README.md and
# docs/adr/0008-local-dev-docker-compose.md.
auth-run:
	docker compose up -d --wait --force-recreate cognito-local
	[ -d local/cognito/node_modules ] || (cd local/cognito && npm install)
	cd local/cognito && node seed.mjs

auth-down:
	docker compose rm -sf cognito-local

gen-api:
	cd backend && uv run python -c "import json,sys; sys.path.insert(0,'src'); from app import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
	cd frontend && npm run gen:api

sam-validate:
	cd infra && sam validate --template template.yaml

sam-build:
	cd infra && sam build --template template.yaml

test: backend-test frontend-test

lint: backend-lint frontend-lint
