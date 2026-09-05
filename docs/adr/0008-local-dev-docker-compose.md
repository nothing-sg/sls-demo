# ADR-0008: Local Postgres and cognito-local via Docker Compose

## Status

Accepted — 2026-09-05

## Context

Before this change, local Postgres was entirely unmanaged by this repo — the README told you to "point `APP_DATABASE_HOST`/`APP_DATABASE_PORT`/`APP_DATABASE_NAME` at whatever local Postgres you run," with no guidance on how to get one. `cognito-local` (ADR-0007) ran natively via a `frontend/` devDependency, launched by a `make auth-run` shell recipe that deleted and recreated `local/cognito/.cognito/` before every start to guarantee fresh seeded state.

Both mechanisms worked, but neither was self-contained: Postgres required a developer to already have one running some other way, and cognito-local's binary lived in `frontend/node_modules` for no reason connected to the frontend build — it was there purely because that's where `npm install --save-dev cognito-local` happened to be run. `docker-compose.yml` now provides both as containerized services, with `make db-up` / `make auth-run` wrapping them.

## Decision

**Scope stays data-services-only.** `docker-compose.yml` defines exactly two services, `postgres` and `cognito-local`. The backend and frontend keep running natively on the host (`make backend-run` / `make frontend-run`) — they are not containerized by this change.

**Postgres is now canonical, not "bring your own."** `make backend-run` depends on `make db-up`, which is `docker compose up -d --wait postgres` — idempotent, so it's free when already running. Credentials (`app`/`app`, database `app`) aren't actually configurable: `backend/src/shared/db.py` hardcodes them into the local connection string regardless of environment variables, so the compose file just has to match, not choose. Data persists in a named volume (`postgres-data`) across `docker compose down`/restarts; `make db-down` only stops the container, and migrations (`alembic upgrade head`) remain a manual step — nothing runs them automatically on startup.

**cognito-local is built from source, not pulled as a pre-built image.** `local/cognito/Dockerfile` runs `npm ci` against `local/cognito/docker/package-lock.json` — a dedicated lockfile pinning `cognito-local@5.3.0`'s full transitive dependency tree (generated via `npm install --package-lock-only`, never installed on the host) — rather than using an existing third-party Docker image from a registry. This repo is a HIPAA/HITRUST-baseline healthcare product; even for dev-only tooling, adding an unaudited third-party container image as a new supply-chain input was judged worse than building from an npm package this repo can pin and review through its own lockfile. No specific alternative image was evaluated or rejected on its merits — the decision was to not introduce that category of dependency at all.

An earlier version of this Dockerfile ran a bare `npm install cognito-local@5.3.0` with no lockfile in the build context, which undercut this exact rationale — the image's own dependency resolution wasn't actually pinned or reviewable by anything, despite the stated justification being lockfile-based review. `local/cognito/docker/package.json` + `package-lock.json` close that gap; they're a build-only pin, kept separate from `local/cognito/package.json` (the seed script's own host-side dependency) so that fixing this never reintroduces a host-installed `cognito-local` binary.

**cognito-local's state lives entirely inside the container — no bind mount.** The old `make auth-run` explicitly ran `rm -rf local/cognito/.cognito` before every start to guarantee fresh seeded accounts (cognito-local has no "reset" API of its own). The container version reproduces that guarantee more simply: `make auth-run` always passes `--force-recreate`, and because no volume or bind mount is declared for `.cognito/`, a recreated container has no prior state to inherit — the wipe is a side effect of normal container lifecycle rather than an explicit file-deletion step. The one static piece of config cognito-local needs before it starts — `UserPoolDefaults.UsernameAttributes: []`, so sign-in uses plain usernames instead of cognito-local's email-alias default — is baked into the image at build time (`COPY cognito-local-config.json .cognito/config.json`) instead of being written to a bind-mounted file at runtime, since it's fixed configuration, not state that needs to reset.

**cognito-local must bind `0.0.0.0`, not its default `127.0.0.1`.** This was found empirically, not anticipated: a Docker `HEALTHCHECK`/compose healthcheck that execs inside the container will report "healthy" even when the server is bound to loopback-only, because the check runs in the same network namespace as the server. The bug only surfaces from *outside* the container — exactly where the host-published port and `make auth-run`'s own seed script sit. `docker-compose.yml` sets `HOST=0.0.0.0` for the `cognito-local` service to fix this; it also changes the issued tokens' `iss` claim to `http://0.0.0.0:9229`, which is inert since `backend/src/shared/auth.py` doesn't verify JWT signatures or issuers at all yet (pre-existing TODO, unrelated to this change).

**Seeding stays host-orchestrated, not compose-owned.** `make auth-run` still runs `local/cognito/seed.mjs` from the host after the container reports healthy, exactly as before — it was not moved into a one-off `docker compose run --rm seed` service. `seed.mjs` writes directly to `frontend/.env.local`; keeping it on the host is a plain file write, whereas containerizing it would require bind-mounting the frontend directory into a throwaway Node container for no benefit.

**The `cognito-local` devDependency was removed from `frontend/package.json`.** Nothing on the host runs that binary anymore (`frontend/node_modules/.bin/cognito-local` is gone from the `auth-run` recipe); the version pin now lives solely in `local/cognito/Dockerfile`.

## Consequences

- A fresh clone needs Docker to do any local backend work (`make backend-run` now depends on `db-up`) or local sign-in testing (`make auth-run`), where previously Postgres needed no repo-provided tooling at all and cognito-local only needed Node.
- `make auth-run` no longer occupies a terminal in the foreground — it returns once seeding finishes, and the server keeps running detached until `make auth-down`. This is a UX change from the prior "own terminal, Ctrl+C to stop" model, documented in `local/cognito/README.md`.
- Nobody should bind-mount `local/cognito/.cognito/` back in for "debuggability" without re-deriving why it isn't there: doing so would silently break the wipe-per-`auth-run` guarantee, since a bind-mounted host directory survives container recreation.
- If cognito-local ever needs a config value beyond the static `UsernameAttributes` override, it has to go through a Dockerfile change (image rebuild) rather than a runtime file write — an intentional tradeoff of simplicity over runtime flexibility, appropriate for a single fixed local-dev config that essentially never changes.
- Migrations are still a manual step after `make db-up` / `make backend-run` first bring Postgres up on a clean volume — a fresh clone's first `make backend-run` will fail against an empty database until `cd backend && uv run alembic upgrade head` is run once. This mirrors the pre-existing manual-migration expectation; it isn't a regression introduced by this change.
