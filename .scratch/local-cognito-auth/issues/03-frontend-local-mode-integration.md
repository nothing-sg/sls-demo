Status: ready-for-agent
Type: AFK
Blocked by: 01-switch-to-amplify.md, 02-local-cognito-server.md

# Frontend local-mode integration + local-testing docs

## Parent

.scratch/local-cognito-auth/spec.md

## What to build

Wire the frontend (now on Amplify — ticket 01) to actually use the local auth server (ticket 02) when configured to do so, and write up the design decision this whole feature rests on.

Add a single new env var, `VITE_COGNITO_LOCAL_ENDPOINT` (already written into `frontend/.env.local` by ticket 02's seed script; stays unset in production and in any `.env.local` deliberately pointed at a real deployed pool). Add config-selection logic in `frontend/src/auth/cognito.ts`: when the var is set, `Amplify.configure(...)` includes a `userPoolEndpoint` override pointing at it, and sign-in is issued with `authFlowType: "USER_PASSWORD_AUTH"`. When unset, behavior is byte-for-byte what ticket 01 produced (default SRP, real endpoint) — this is the one part of the whole feature that must have zero effect on anyone not opting into local mode.

This config-selection function is the one unit-tested seam for this whole feature (agreed with the user during spec design) — write a test for it following the existing pattern in `frontend/src/api/client.test.ts` / `frontend/src/auth/tokenStore.test.ts` (plain Vitest, `node` environment, no mocking needed since it's pure logic with no I/O).

**End-to-end verification** (do this, don't just trust the unit test): run `make auth-run` (ticket 02's local server + seeded users), then `make frontend-run` with `VITE_COGNITO_LOCAL_ENDPOINT` set, and actually sign in through the real login UI as each seeded user (`local-admin`, `local-clinic-ops`, and `local-new-hire` if ticket 02 confirmed it works) via a headless browser (Playwright — see how this was done earlier in this project's history for the pattern: install via a temp devDependency, verify, then remove it again; don't leave it as a permanent project dependency). Confirm: sign-in succeeds, RBAC-gated UI differs correctly by role (the Deactivate button / Audit Log nav link visible only for `local-admin`), and — critically — that leaving `VITE_COGNITO_LOCAL_ENDPOINT` unset doesn't break anything (the app should behave exactly as it did before this whole feature, i.e. redirect to `/login` and, without a real deployed pool, show the same "not configured" error in the form that this project's earlier work already established as the correct graceful-degradation behavior).

Write ADR-0007, documenting the full local/production auth-flow divergence design: why it exists (neither `cognito-local` nor LocalStack can emulate the SRP flow production uses — LocalStack additionally requires a paid tier for Cognito on a commercial product; both facts should be stated plainly, they were the actual reason this design looks the way it does), what diverges (auth flow type, MFA), what's identical (everything downstream of a successful sign-in — RBAC gating, routing, forms, token handling), and the explicit tradeoffs considered and rejected (weakening production to `USER_PASSWORD_AUTH` everywhere; dropping local emulation entirely). Follow this repo's ADR format/numbering.

Update `local/cognito/README.md` (from ticket 02) if anything about the frontend-side setup steps needs adding there. Update `README.md`'s existing "Frontend" section with a pointer to `make auth-run`. Update `docs/agents/domain.md`'s ADR file listing to include 0006 and 0007. Update `AGENTS.md` if its frontend-structure section needs a mention of the local auth path.

Research notes are at `/tmp/sls-best-practice-implement-spec/research.md`.

## Acceptance criteria

- [ ] `VITE_COGNITO_LOCAL_ENDPOINT` set → sign-in goes through `cognito-local` via `USER_PASSWORD_AUTH`; unset → sign-in is identical to ticket 01's production behavior (verified, not assumed)
- [ ] A unit test for the config-selection logic exists and passes, following the existing `*.test.ts` pattern in this codebase
- [ ] Live, end-to-end verification performed (not skipped): signed in as each seeded local user via a real browser against the real login UI; RBAC-gated UI confirmed correct per role; confirmed the unset-env-var case is unaffected
- [ ] Any temporary tooling used for that live verification (e.g. Playwright) is removed afterward, not left as a permanent dependency
- [ ] `docs/adr/0007-*.md` is written per the description above
- [ ] `README.md`, `docs/agents/domain.md`, and `local/cognito/README.md` (and `AGENTS.md` if relevant) are updated
- [ ] `npm run build`, `npm run lint`, `npm run test` all pass in `frontend/`

## Blocked by

- 01-switch-to-amplify.md (extends its Amplify configuration)
- 02-local-cognito-server.md (needs a live seeded server to verify sign-in against)
