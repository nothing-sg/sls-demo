# Local Cognito auth server

A local, Cognito-API-compatible auth server ([`cognito-local`](https://github.com/jagregory/cognito-local)),
pre-seeded with test accounts for this app's two RBAC roles (ADR-0004), so you can sign in through the
app's real login screen without a deployed AWS Cognito User Pool.

## Run it

```bash
make auth-run   # builds + starts the cognito-local container, then seeds it
```

`make auth-run` is opt-in and never started by any other `make` target; it returns your terminal once
seeding finishes (the server runs detached in Docker, not in the foreground). Stop it with `make auth-down`.

Then run `make frontend-run` as usual and sign in at `http://localhost:5173` with one of the accounts below.

**State is ephemeral by design.** `make auth-run` always passes `--force-recreate`, so every run gets a
brand-new container — cognito-local's on-disk database lives entirely inside the container (no bind mount)
and is discarded with it. Nothing persists across restarts. See
[ADR-0008](../../docs/adr/0008-local-dev-docker-compose.md) for why it's built this way instead of
bind-mounting a host directory.

## What it does

1. Builds and starts the `cognito-local` service (`local/cognito/Dockerfile`, `docker-compose.yml` at the
   repo root) on its default port, `9229`, via `docker compose up -d --wait --force-recreate cognito-local`.
2. Runs `local/cognito/seed.mjs` once the container reports healthy, which:
   - creates a local User Pool with the `custom:role` schema attribute (matching
     `infra/modules/api.yaml`'s real pool and `backend/src/shared/auth.py`'s `Role` enum)
   - creates a User Pool Client with `ALLOW_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`
   - creates the seed accounts below
   - writes `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_LOCAL_ENDPOINT` into
     `frontend/.env.local` (creating the file if needed; only those three keys are touched — any other
     local overrides you've added stay untouched)
3. Leaves the server running detached in Docker (`make auth-down` to stop it).

MFA is off on the local pool — a deliberate divergence from the real pool's `MfaConfiguration: "ON"`
(`infra/modules/api.yaml`); `cognito-local` cannot honor TOTP MFA at all, and exercising MFA enrollment
isn't this tooling's goal.

## Seeded accounts

| Username            | Password           | `custom:role` | State                  |
| -------------------- | ------------------- | -------------- | ----------------------- |
| `local-admin`         | `LocalAdmin123!`     | `admin`        | permanent password      |
| `local-clinic-ops`    | `LocalClinicOps123!` | `clinic_ops`   | permanent password      |
| `local-new-hire`      | *(none — see below)* | `clinic_ops`   | `FORCE_CHANGE_PASSWORD` |

`local-new-hire` is deliberately left without a permanent password so you can exercise the app's real
first-sign-in / "set a new password" screen. Sign in with username `local-new-hire` and **any** password —
`cognito-local` returns a `NEW_PASSWORD_REQUIRED` challenge before it ever checks the password you typed,
so what you enter for the first attempt doesn't matter. The login screen will then prompt you to set a
real password, which becomes that account's permanent password for the rest of the session (until the
next `make auth-run` resets everything).

These are placeholder credentials for a local, ephemeral, non-production auth server only — not secrets.

## Empirical check: does `AdminCreateUser` actually produce `FORCE_CHANGE_PASSWORD` locally?

**Yes — confirmed by live testing against a running `cognito-local` instance, not just by reading its
docs.** `cognito-local`'s own README marks `AdminCreateUser` and `InitiateAuth` as only "partially
implemented" and doesn't say either way whether the challenge state works. Reading its source
(`cognito-local/lib/targets/adminCreateUser.js`, `initiateAuth.js`) showed `AdminCreateUser` unconditionally
sets `UserStatus: "FORCE_CHANGE_PASSWORD"` when no password is set, and `InitiateAuth`'s
`USER_PASSWORD_AUTH` handler checks that status *before* validating the password and returns a
`NEW_PASSWORD_REQUIRED` challenge. This was then verified live end-to-end:

1. `AdminCreateUser` (no `AdminSetUserPassword` call) → `AdminGetUser` reports `UserStatus: FORCE_CHANGE_PASSWORD`.
2. `InitiateAuth` with `AuthFlow: USER_PASSWORD_AUTH` → response has `ChallengeName: "NEW_PASSWORD_REQUIRED"`.
3. `RespondToAuthChallenge` with `ChallengeName: "NEW_PASSWORD_REQUIRED"` and a new password → real
   `AuthenticationResult` tokens come back.

So `local-new-hire` ships as originally specified — no gap here.

## Known gaps / local-vs-production divergences

- **Auth flow.** `cognito-local` does not support `USER_SRP_AUTH` at all — only `USER_PASSWORD_AUTH`. The
  real pool's client (`infra/modules/api.yaml`) only allows `ALLOW_USER_SRP_AUTH`; this local pool's
  client only allows `ALLOW_USER_PASSWORD_AUTH` + refresh tokens instead. `frontend/src/auth/cognito.ts`'s
  `resolveLocalAuthOverride()` is the single seam that branches on whether `VITE_COGNITO_LOCAL_ENDPOINT`
  is set to pick the flow (unset: no overrides at all, production behaves exactly as before this feature)
  — see [ADR-0007](../../docs/adr/0007-local-auth-flow-divergence.md) for the full rationale. **This means
  local testing cannot verify that real SRP auth works against production Cognito** — that has to be
  checked against a real deployed pool.
- **MFA.** Off locally; `"ON"` in production. `cognito-local` can't emulate TOTP MFA, so MFA
  enrollment/challenge UI can't be exercised locally at all.
- **Username sign-in.** The real pool doesn't declare `UsernameAttributes`, so sign-in is by plain
  username (matching `frontend/src/pages/LoginPage.tsx`'s "Username" field). `cognito-local` defaults to
  requiring email-shaped usernames; this is overridden via a `UserPoolDefaults.UsernameAttributes: []`
  entry in `local/cognito/cognito-local-config.json`, baked into the image at `.cognito/config.json`
  (`local/cognito/Dockerfile`) rather than generated at runtime.
- **JWT signature verification.** `backend/src/shared/auth.py` doesn't verify JWT signatures against
  Cognito's JWKS yet (existing TODO, unrelated to this feature) — unaffected either way by local vs. real
  Cognito.

## Directory layout

- `local/cognito/seed.mjs` — the seed script (`@aws-sdk/client-cognito-identity-provider`, this
  directory's own devDependency — kept out of `frontend/`'s dependency tree entirely, so it has zero
  production bundle impact). Still runs on the host, not in a container, since it writes directly to
  `frontend/.env.local`.
- `local/cognito/package.json` — only the seed script's dependency; not part of the Vite app.
- `local/cognito/Dockerfile` — builds the `cognito-local` npm package into its own image via `npm ci`,
  rather than using a pre-built third-party image (ADR-0008).
- `local/cognito/docker/package.json` + `package-lock.json` — pins `cognito-local`'s version and full
  dependency tree for that build. Never installed on the host (that's `local/cognito/package.json`,
  below) — regenerate with `cd local/cognito/docker && npm install --package-lock-only` after bumping
  the version.
- `local/cognito/cognito-local-config.json` — the static `UsernameAttributes: []` override, baked into
  the image at build time.
