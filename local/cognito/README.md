# Local Cognito auth server

A local, Cognito-API-compatible auth server ([`cognito-local`](https://github.com/jagregory/cognito-local)),
pre-seeded with test accounts for this app's two RBAC roles (ADR-0004), so you can sign in through the
app's real login screen without a deployed AWS Cognito User Pool.

## Run it

```bash
make frontend-install   # once — installs cognito-local into frontend/node_modules
make auth-run            # starts the server, seeds it, then runs in the foreground
```

`make auth-run` is opt-in and never started by any other `make` target. It runs in its own terminal;
`Ctrl+C` stops the server cleanly (no orphaned processes — verified).

Then run `make frontend-run` as usual and sign in at `http://localhost:5173` with one of the accounts below.

**State is ephemeral by design.** `local/cognito/.cognito/` (cognito-local's on-disk database) is deleted
and recreated at the start of every `make auth-run` — nothing persists across restarts, and the directory
is gitignored.

## What it does

1. Starts `cognito-local` (an `npm install --save-dev cognito-local` devDependency of `frontend/`) on its
   default port, `9229`.
2. Runs `local/cognito/seed.mjs` once the server is reachable, which:
   - creates a local User Pool with the `custom:role` schema attribute (matching
     `infra/modules/api.yaml`'s real pool and `backend/src/shared/auth.py`'s `Role` enum)
   - creates a User Pool Client with `ALLOW_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`
   - creates the seed accounts below
   - writes `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_LOCAL_ENDPOINT` into
     `frontend/.env.local` (creating the file if needed; only those three keys are touched — any other
     local overrides you've added stay untouched)
3. Runs the server in the foreground.

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
  client only allows `ALLOW_USER_PASSWORD_AUTH` + refresh tokens instead. Frontend code branches on
  whether `VITE_COGNITO_LOCAL_ENDPOINT` is set to pick the flow — see the parent spec
  (`.scratch/local-cognito-auth/spec.md`) and the relevant ADR for the full rationale. **This means local
  testing cannot verify that real SRP auth works against production Cognito** — that has to be checked
  against a real deployed pool.
- **MFA.** Off locally; `"ON"` in production. `cognito-local` can't emulate TOTP MFA, so MFA
  enrollment/challenge UI can't be exercised locally at all.
- **Username sign-in.** The real pool doesn't declare `UsernameAttributes`, so sign-in is by plain
  username (matching `frontend/src/pages/LoginPage.tsx`'s "Username" field). `cognito-local` defaults to
  requiring email-shaped usernames; `make auth-run` overrides this via a `UserPoolDefaults.UsernameAttributes: []`
  entry it writes into `local/cognito/.cognito/config.json` before starting the server (part of the
  ephemeral reset — this file is recreated every run, not preserved).
- **JWT signature verification.** `backend/src/shared/auth.py` doesn't verify JWT signatures against
  Cognito's JWKS yet (existing TODO, unrelated to this feature) — unaffected either way by local vs. real
  Cognito.

## Directory layout

- `local/cognito/seed.mjs` — the seed script (`@aws-sdk/client-cognito-identity-provider`, this
  directory's own devDependency — kept out of `frontend/`'s dependency tree entirely, so it has zero
  production bundle impact).
- `local/cognito/package.json` — only the seed script's dependency; not part of the Vite app.
- `local/cognito/.cognito/` — `cognito-local`'s on-disk state (gitignored, wiped every `make auth-run`).
