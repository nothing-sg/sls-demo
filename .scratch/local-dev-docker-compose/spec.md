Status: ready-for-agent

# Local Postgres and cognito-local via Docker Compose

## Problem Statement

Local Postgres was entirely unmanaged by this repo — the README told a developer to "point `APP_DATABASE_HOST`/`APP_DATABASE_PORT`/`APP_DATABASE_NAME` at whatever local Postgres you run," with no guidance on how to actually get one. Separately, `cognito-local` (the local Cognito-compatible auth server from the local-cognito-auth feature) ran as a native process launched from a `frontend/` devDependency binary, for no reason connected to the frontend build — it lived there only because `npm install --save-dev cognito-local` happened to be run from that directory. Neither local dependency was self-contained, and a fresh clone had no single, reliable path to a working local Postgres.

## Solution

A developer runs `make db-up` (or just `make backend-run`, which now depends on it) to get a local Postgres in Docker, matching the backend's existing hardcoded local connection defaults, with data persisting across restarts in a named volume. Separately, `make auth-run` now builds and starts `cognito-local` as its own Docker container instead of a native `frontend/node_modules` binary, then seeds it exactly as before — same seeded accounts, same `frontend/.env.local` write, same guarantee of fresh state on every run. Both services are defined in one `docker-compose.yml` at the repo root; the backend and frontend themselves keep running natively on the host, unchanged.

## User Stories

1. As a backend developer, I want a documented, single-command way to get a local Postgres, so that I don't have to already have one running some other way before I can start the backend.
2. As a backend developer, I want `make backend-run` to bring up Postgres for me automatically if it isn't already running, so that "forgot to start the database" isn't a failure mode I have to remember to avoid.
3. As a backend developer, I want my local Postgres data (patients, appointments, etc.) to survive restarting the container, so that I don't lose local test data every time I stop and start my dev environment.
4. As a backend developer who prefers to manage Postgres myself (a different local install, a different container setup), I want the existing `APP_DATABASE_HOST`/`PORT`/`NAME` override to keep working, so that this feature doesn't force a single way of doing things on everyone.
5. As a frontend developer, I want `make auth-run` to keep working exactly the way it did before (same seeded accounts, same `frontend/.env.local` write, same fresh-state-every-run guarantee), so that switching cognito-local to run in Docker is invisible to my day-to-day workflow.
6. As a frontend developer, I want `make auth-run` to return my terminal once seeding finishes rather than blocking it in the foreground, so that I don't need a dedicated terminal just to keep the local auth server alive.
7. As a frontend developer, I want a way to stop the local auth server (`make auth-down`) and the local Postgres (`make db-down`) independently of each other, so that I can tear down only what I'm not using.
8. As a maintainer, I want cognito-local's Docker image built from the same npm package version this repo already depended on directly, rather than a pre-built third-party image pulled from a registry, so that local dev tooling doesn't introduce an unaudited new supply-chain input on a HIPAA/HITRUST-baseline product.
9. As a maintainer, I want cognito-local's on-disk state to live entirely inside its container with no bind mount, so that the "wipe state on every start" guarantee is a structural property of the container lifecycle (`--force-recreate`) rather than something a shell script has to remember to do (`rm -rf .cognito`).
10. As a maintainer, I want the `cognito-local` npm devDependency removed from `frontend/package.json` once nothing on the host runs that binary anymore, so that the dependency tree doesn't carry a package nothing uses.
11. As a maintainer reading this later, I want a documented reason why cognito-local is built from source instead of a pre-built image, why its state isn't bind-mounted, and why migrations stay a manual step, so that these don't read as arbitrary or accidental choices.
12. As anyone running `make auth-run`, I want the local auth server to actually be reachable from outside its container (not just from a healthcheck that happens to run inside the same container), so that a container reporting "healthy" is a real signal, not a false positive caused by the healthcheck sharing the server's own network namespace.
13. As a CI pipeline, I want to keep passing without Docker, Postgres, or cognito-local available, so that this local-only tooling never becomes a hard CI dependency (backend tests already run against in-memory SQLite, unrelated to this feature).

## Implementation Decisions

- **Scope**: `docker-compose.yml` at the repo root defines exactly two services, `postgres` and `cognito-local`. The backend and frontend are not containerized by this feature and keep running natively (`make backend-run` / `make frontend-run`).
- **Postgres service**: `postgres:16-alpine` (no production Aurora engine version is pinned to match, by existing deliberate design — see `infra/modules/data.yaml`). Credentials are `app`/`app`, database `app` — matching the hardcoded local connection string in `backend/src/shared/db.py`, which isn't independently configurable via `APP_DATABASE_*` env vars. Data lives in a named Docker volume so it survives `docker compose down`/restarts. A `pg_isready`-based healthcheck backs `docker compose up -d --wait`.
- **cognito-local service**: built from `local/cognito/Dockerfile` (`node:22-alpine` + `npm install cognito-local@5.3.0`, the version this repo already depended on directly before this feature), not a pre-built third-party image. The static `UserPoolDefaults.UsernameAttributes: []` override (needed so sign-in uses plain usernames, matching the real pool) is baked into the image at build time from `local/cognito/cognito-local-config.json`, rather than written to a bind-mounted file at runtime. No volume or bind mount is declared for the container's state directory (`.cognito/`) — state lives entirely inside the container's own filesystem. The service sets `HOST=0.0.0.0` as an environment variable, overriding cognito-local's default loopback-only bind; without this, a healthcheck exec'd inside the container reports healthy while the host-published port is unreachable from outside, since the check runs in the same network namespace as the server.
- **Makefile targets**: `db-up` (`docker compose up -d --wait postgres`, idempotent) and `db-down` (`docker compose stop postgres`, data-preserving). `backend-run` now depends on `db-up`. `auth-run` is reworked to `docker compose up -d --wait --force-recreate cognito-local` (the `--force-recreate` flag is what guarantees fresh state every run, replacing the old `rm -rf local/cognito/.cognito` step) followed by the existing `local/cognito/seed.mjs` invocation, unchanged. A new `auth-down` (`docker compose rm -sf cognito-local`) stops and removes the container.
- **Seeding stays host-orchestrated**: `local/cognito/seed.mjs` continues to run on the host (not in a container) after the compose healthcheck reports the service ready, because it writes directly to `frontend/.env.local` — containerizing it would require bind-mounting the frontend directory into a throwaway Node container for no benefit.
- **Migrations stay manual**: `docker compose up`/`make db-up` never auto-runs `alembic upgrade head`. A developer runs it themselves once against a fresh volume, and again after pulling new migrations — unchanged from the pre-existing expectation, not a regression.
- **`frontend/package.json`**: the `cognito-local` devDependency and its `package-lock.json` entries are removed, since nothing on the host runs that binary anymore. The version pin now lives solely in `local/cognito/Dockerfile`.
- **`.gitignore`**: the now-stale `local/cognito/.cognito/` ignore entry is removed, since that directory no longer exists on the host under this design.
- **Documentation**: `docs/adr/0008-local-dev-docker-compose.md` records the non-obvious calls (custom vs. third-party image, no-bind-mount ephemeral state vs. the old wipe-script pattern, manual vs. automatic migrations, the `HOST=0.0.0.0` fix and why it was only found empirically). `README.md`'s "Local database" section documents `make db-up`/`db-down` as the canonical path, while noting the `APP_DATABASE_*` override still works for a self-managed Postgres. `local/cognito/README.md` is updated throughout to describe the Docker-based flow in place of the native-binary one.

## Testing Decisions

- **What makes a good test here**: this feature introduced no new application logic — no new pure functions, no new frontend or backend code paths. Everything it changes is infrastructure configuration (`docker-compose.yml`, `local/cognito/Dockerfile`, `Makefile`) and documentation. There is no unit-testable seam analogous to `resolveLocalAuthOverride()` from the local-cognito-auth feature.
- **Modules tested**: none (no new `*.test.ts` / pytest coverage applies). Existing backend (`pytest`, in-memory SQLite) and frontend (`vitest`) suites are unaffected and must keep passing exactly as before, with no Docker, Postgres, or cognito-local dependency.
- **Required empirical verification at implementation time** (acceptance checks, not automated tests, following the same pattern ADR-0007 used for cognito-local's original orchestration):
  - `make db-up` brings Postgres to a healthy state, and `cd backend && uv run alembic upgrade head` applies cleanly against it.
  - The named Postgres volume survives `docker compose down` (without `-v`) — confirmed by inspecting `docker volume ls` after teardown, not assumed from the compose file alone.
  - `make auth-run` builds, starts, and seeds `cognito-local`, and a real `InitiateAuth` call (`USER_PASSWORD_AUTH`, the seeded `local-admin` credentials) returns a genuine `AuthenticationResult` — not just that the seed script exits `0`.
  - Running `make auth-run` twice in a row produces two different User Pool IDs with no `UsernameExistsError` on the second seed, confirming `--force-recreate` actually wipes state rather than reusing a stale container.
  - The service is verified reachable from *outside* the container (e.g. a host-side `InitiateAuth` call succeeding), not only via the in-container healthcheck — this check is what surfaces a loopback-only bind regression like the `HOST=0.0.0.0` fix, which an in-container-only check cannot detect.
  - `make backend-lint`, `make backend-test`, `make frontend-lint`, `make frontend-test`, and `make frontend-build` all still pass unchanged after the `frontend/package.json` devDependency removal.

## Out of Scope

- Containerizing the backend or frontend themselves — they continue to run natively on the host.
- Automatically running database migrations as part of `docker compose up` or any Makefile target — this stays a manual, explicit step.
- Closing `backend/src/shared/auth.py`'s existing JWT/JWKS signature-verification TODO — unrelated pre-existing gap, unaffected by this feature either way.
- Evaluating or adopting any specific pre-built third-party `cognito-local` Docker image — the decision was to not introduce that category of dependency at all, not a comparison of specific candidates.
- A CI job that exercises the compose stack — CI does not have Docker available or need it; the backend test suite already runs against in-memory SQLite, independent of this feature.

## Further Notes

This spec was written after implementation (via `/to-spec`), synthesizing the requirements gathered through a `/grill-with-docs` interview earlier in the same session, rather than authored up front. The `HOST=0.0.0.0` fix in particular was not something anyone anticipated during that interview — it was found empirically during implementation-time verification, precisely because that verification insisted on checking reachability from outside the container rather than trusting an in-container healthcheck's "healthy" status. A separate, unrelated discovery during that same verification: an orphaned native `cognito-local` process from before the session (bound to `localhost:9229` over IPv6) was silently answering requests during the first verification pass, which is why the empirical checks above are written to be specific about *what* was confirmed (a real cross-container network round-trip) rather than just "seeding succeeded."
