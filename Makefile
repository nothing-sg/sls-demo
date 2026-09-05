.PHONY: backend-install backend-test backend-lint backend-run \
        frontend-install frontend-build frontend-test frontend-lint frontend-run frontend-run-public \
        gen-api sam-build sam-validate test lint \
        db-up db-down auth-run auth-down auth-run-public cognito-local-up \
        tunnel-up tunnel-down

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

# Shares a live demo of the frontend dev server with a third party over the
# "frontend" ngrok tunnel (see .scratch/public-access-ngrok/spec.md). Opt-in;
# `frontend-run`'s own behavior is completely unchanged. Requires
# `make tunnel-up` to already be running -- fails with a clear message
# rather than falling back to localhost if it isn't. Generates a fresh
# Basic Auth username/password every time it runs, gates the tunnel with
# it, prints both to the terminal (never to a file), and starts Vite bound
# externally with `allowedHosts` set to that exact tunnel hostname. See
# local/ngrok/frontendRunPublic.mjs for the full flow and its empirical
# verification status.
frontend-run-public:
	node local/ngrok/frontendRunPublic.mjs

# Local Postgres for the backend (see backend/src/shared/config.py /
# db.py). Persists data across restarts in a named Docker volume; run
# `cd backend && uv run alembic upgrade head` yourself after the first
# `db-up`. See docker-compose.yml and docs/adr/0008-local-dev-docker-compose.md.
db-up:
	docker compose up -d --wait postgres

db-down:
	docker compose stop postgres

# Shared by auth-run / auth-run-public below: (re)starts the cognito-local
# container and ensures the seed script's own dependencies are installed.
# Not meant to be run on its own.
cognito-local-up:
	docker compose up -d --wait --force-recreate cognito-local
	[ -d local/cognito/node_modules ] || (cd local/cognito && npm install)

# Local Cognito-compatible auth server (cognito-local, containerized), for
# local sign-in testing without a deployed AWS Cognito User Pool. Opt-in,
# never started by any other target. State is ephemeral: --force-recreate
# guarantees a fresh container (and therefore a wiped cognito-local
# database) on every `make auth-run`, same guarantee the old
# rm -rf local/cognito/.cognito gave. See local/cognito/README.md and
# docs/adr/0008-local-dev-docker-compose.md.
auth-run: cognito-local-up
	cd local/cognito && node seed.mjs

auth-down:
	docker compose rm -sf cognito-local

# Same cognito-local container + seed flow as `make auth-run`, but seeds
# frontend/.env.local's VITE_COGNITO_LOCAL_ENDPOINT with the cognito-local
# ngrok tunnel's current public URL instead of localhost, so a browser
# reached via the public frontend tunnel (make frontend-run-public) can
# still reach cognito-local directly (Amplify's client-side auth calls hit
# this endpoint from wherever the browser actually is, not proxied
# server-side the way /api is). Looks up that URL via the shared
# local/ngrok/lookupTunnel.mjs utility -- fails with a clear message
# pointing at `make tunnel-up` if the tunnel isn't up yet, rather than
# silently seeding localhost, and never touches the container in that case.
# The seed script's own connection to cognito-local always stays localhost
# regardless -- see local/cognito/seed.mjs. Opt-in; `make auth-run`'s
# behavior is unaffected by this target existing.
auth-run-public:
	@tunnel_url="$$(node local/ngrok/lookupTunnel.mjs cognito-local)"; \
	status=$$?; \
	if [ $$status -ne 0 ] || [ -z "$$tunnel_url" ]; then \
		echo "" >&2; \
		echo "cognito-local tunnel is not up -- run \`make tunnel-up\` first, then retry \`make auth-run-public\`." >&2; \
		exit 1; \
	fi; \
	echo "cognito-local tunnel: $$tunnel_url"; \
	$(MAKE) cognito-local-up; \
	cd local/cognito && COGNITO_LOCAL_PUBLIC_ENDPOINT="$$tunnel_url" node seed.mjs

# Two independently-identifiable ngrok tunnels -- one fronting the frontend
# dev server (:5173), one fronting cognito-local (:9229) -- for sharing a
# live demo with a third party (see .scratch/public-access-ngrok/spec.md).
# Opt-in, never started by any other target; owns its own process lifecycle
# independently of db-up/auth-run/frontend-run. Requires the ngrok CLI and a
# one-time `ngrok config add-authtoken <token>` -- see local/ngrok/README.md.
# Only returns once ngrok's local API confirms both tunnels are up.
tunnel-up:
	./local/ngrok/tunnel-up.sh

tunnel-down:
	./local/ngrok/tunnel-down.sh

gen-api:
	cd backend && uv run python -c "import json,sys; sys.path.insert(0,'src'); from app import app; json.dump(app.openapi(), open('openapi.json','w'), indent=2)"
	cd frontend && npm run gen:api

sam-validate:
	cd infra && sam validate --template template.yaml

sam-build:
	cd infra && sam build --template template.yaml

test: backend-test frontend-test

lint: backend-lint frontend-lint
