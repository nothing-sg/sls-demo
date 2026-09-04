.PHONY: backend-install backend-test backend-lint backend-run \
        frontend-install frontend-build frontend-test frontend-lint frontend-run \
        gen-api sam-build sam-validate test lint

backend-install:
	cd backend && uv sync --group dev

backend-test:
	cd backend && uv run pytest

backend-lint:
	cd backend && uv run ruff check src tests && uv run mypy src

backend-run:
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

gen-api:
	cd backend && uv run python -c "import json,sys; sys.path.insert(0,'src'); from app import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
	cd frontend && npm run gen:api

sam-validate:
	cd infra && sam validate --template template.yaml

sam-build:
	cd infra && sam build --template template.yaml

test: backend-test frontend-test

lint: backend-lint frontend-lint
