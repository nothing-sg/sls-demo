Status: ready-for-agent
Type: AFK
Blocked by: None - can start immediately (independent of ticket 01)

# Local Cognito-compatible auth server + seed script

## Parent

.scratch/local-cognito-auth/spec.md

## What to build

A new top-level `local/cognito/` directory providing a local, Cognito-API-compatible auth server (`cognito-local`, added as a `frontend/` devDependency) pre-seeded with test accounts for this app's two RBAC roles, so it can back local sign-in testing without a deployed AWS Cognito User Pool.

This ticket does **not** touch `frontend/src/` application code — it produces a standalone local server + seed script that can be verified entirely via AWS SDK/CLI calls against the running local server, independent of the frontend.

**Server**: `cognito-local`, run on its default port. Configure it with MFA off (it cannot honor real Cognito's `MfaConfiguration: "ON"` — this is a deliberate, already-agreed divergence from the real pool in `infra/modules/api.yaml`, which is not being changed).

**Seed script**: a Node script (using `@aws-sdk/client-cognito-identity-provider`, a dev-only dependency — this ticket's script has no production bundle impact) that, against the running local server:
1. Creates a local User Pool with a `custom:role` schema attribute.
2. Creates a User Pool Client with `ALLOW_USER_PASSWORD_AUTH` and refresh-token auth enabled (this local pool does NOT need to match the real pool's `ALLOW_USER_SRP_AUTH`-only client — see research notes for why: cognito-local does not support `USER_SRP_AUTH` at all, only `USER_PASSWORD_AUTH`, which is why local testing necessarily uses a different flow than production).
3. Creates `local-admin` and `local-clinic-ops`, each with a permanent password and the corresponding `custom:role` value (`admin` / `clinic_ops` — must match the string values `backend/src/shared/auth.py`'s `Role` enum expects).
4. Creates `local-new-hire` and leaves it in `FORCE_CHANGE_PASSWORD` status — **but only after empirically confirming this actually works against cognito-local first** (see below).
5. Writes the discovered User Pool ID and Client ID into `frontend/.env.local` (creating the file if it doesn't exist; updating just those keys if it does — don't clobber other local overrides a developer may have added). Use the env var names `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` (already established, already in `frontend/.env.example`) plus a new `VITE_COGNITO_LOCAL_ENDPOINT` pointing at the local server's URL.

**Required empirical check** (do this before finalizing step 4 above, and report the outcome plainly): does `cognito-local`'s `AdminCreateUser` (without `AdminSetUserPassword`) actually leave a user in a state where `InitiateAuth`/`AdminInitiateAuth` returns a `NEW_PASSWORD_REQUIRED` challenge? Its own documentation marks `AdminCreateUser` as only partially implemented and doesn't confirm this either way. If it works: seed `local-new-hire` as described. If it does not: drop that seed user, and write a clear note in `local/cognito/README.md` (see below) stating plainly that the new-password/first-sign-in screen cannot be exercised against local testing and has to be checked against a real deployed pool instead. Do not simulate or fake the challenge state client-side to work around this.

**Orchestration**: a new `make auth-run` Makefile target that starts `cognito-local`, polls until it's ready, runs the seed script once, then runs the server in the foreground (so `Ctrl+C` stops it cleanly) — matching the existing `backend-run`/`frontend-run` pattern of separate, explicitly-started, foreground dev processes. It must not be auto-started by any other `make` target.

**State**: ephemeral. Whatever on-disk state `cognito-local` persists (check its docs/behavior — likely a `.cognito/` directory) must be cleared at the start of every `make auth-run`, and that directory must be gitignored.

Write `local/cognito/README.md` documenting: how to run it, the three (or two, if the empirical check fails) seeded accounts and their credentials, and any known gap from the empirical check above.

Research notes (cognito-local's config format, confirmed capabilities and limitations, port, persistence directory) are at `/tmp/sls-best-practice-implement-spec/research.md` — read that first.

## Acceptance criteria

- [ ] `cognito-local` runs via `make auth-run` and is reachable on its default port
- [ ] The seed script successfully creates the local User Pool (with `custom:role` schema), Client, and `local-admin` / `local-clinic-ops` users with permanent passwords — verified by actually running it, not just reading its code
- [ ] `local-new-hire` is seeded in `FORCE_CHANGE_PASSWORD` status **if and only if** empirically confirmed to work; otherwise it's absent and the gap is documented in `local/cognito/README.md` — report which outcome occurred
- [ ] `frontend/.env.local` is written/updated with `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_LOCAL_ENDPOINT` after seeding, without clobbering unrelated keys a developer may already have there
- [ ] `cognito-local`'s on-disk state directory is gitignored and reset on every `make auth-run` start
- [ ] `local/cognito/README.md` documents the seeded accounts, credentials, and any known gap
- [ ] No `frontend/src/` application code is touched by this ticket
- [ ] `make auth-run` cleanly stops on Ctrl+C without leaving orphaned processes

## Blocked by

None - can start immediately
