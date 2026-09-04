.PHONY: backend-install backend-test backend-lint backend-run \
        frontend-install frontend-build frontend-test frontend-lint frontend-run \
        gen-api sam-build sam-validate test lint auth-run

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

# Local Cognito-compatible auth server (cognito-local), pre-seeded with test
# accounts for local sign-in testing -- never a deployed AWS Cognito User
# Pool. Opt-in, own terminal, never started by any other target. State is
# ephemeral: local/cognito/.cognito/ is wiped before every start. See
# local/cognito/README.md.
auth-run:
	rm -rf local/cognito/.cognito
	mkdir -p local/cognito/.cognito
	echo '{"UserPoolDefaults":{"UsernameAttributes":[]}}' > local/cognito/.cognito/config.json
	[ -d local/cognito/node_modules ] || (cd local/cognito && npm install)
	cd local/cognito && ( \
	  ../../frontend/node_modules/.bin/cognito-local & \
	  COGNITO_PID=$$!; \
	  trap 'kill $$COGNITO_PID 2>/dev/null' EXIT INT TERM; \
	  until curl -s -o /dev/null http://localhost:9229/; do sleep 0.3; done; \
	  node seed.mjs; \
	  wait $$COGNITO_PID \
	)

gen-api:
	cd backend && uv run python -c "import json,sys; sys.path.insert(0,'src'); from app import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
	cd frontend && npm run gen:api

sam-validate:
	cd infra && sam validate --template template.yaml

sam-build:
	cd infra && sam build --template template.yaml

test: backend-test frontend-test

lint: backend-lint frontend-lint
