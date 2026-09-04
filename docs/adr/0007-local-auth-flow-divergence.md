# ADR-0007: Local Cognito testing — auth-flow divergence, MFA-off, ephemeral state

## Status

Accepted — 2026-09-04

## Context

Nearly every screen in this app requires an authenticated, role-checked session (ADR-0004's RBAC model), so frontend developers could not click through the app at all without a deployed AWS Cognito User Pool — no local sign-in path existed. ADR-0006 switched the frontend to AWS Amplify's Auth module partly to make this feature possible, via Amplify v6's documented `userPoolEndpoint` config override; this ADR covers what that override is used for and why the resulting local/production design diverges instead of being a clean 1:1 mirror.

The divergence exists because **neither of the two realistic local-Cognito options can emulate the SRP (`USER_SRP_AUTH`) flow production uses**, confirmed against current sources rather than assumed (see `.scratch/local-cognito-auth/spec.md`'s Further Notes and `/tmp/sls-best-practice-implement-spec/research.md`):

- **`cognito-local`** (the option this project uses): its own README lists "Only `USER_PASSWORD_AUTH` flow is supported" as a known limitation — no SRP support at all.
- **LocalStack**: Cognito IDP requires a paid tier — `"❌ Not available"` on the free Hobby tier per LocalStack's own licensing docs, and this is a commercial healthcare product, so the free tier's non-commercial terms wouldn't apply regardless. Even on paid tiers, LocalStack's own docs only demonstrate `USER_PASSWORD_AUTH`, and multiple open GitHub issues (localstack/localstack #12945, #12756, #6499) report `USER_SRP_AUTH`'s challenge-response step failing to return a valid result.

Both facts are stated plainly here because they are the actual reason this design looks the way it does — this is not an arbitrary or accidental inconsistency between local and production auth.

## Decision

Local sign-in testing uses `cognito-local` (`local/cognito/`, ticket 02), and the frontend picks between two auth configurations based on a single env var, `VITE_COGNITO_LOCAL_ENDPOINT` (unset in production and in any `.env.local` deliberately pointed at a real deployed pool; written automatically by `make auth-run`'s seed script otherwise — see `local/cognito/README.md`).

The one config-selection seam, `resolveLocalAuthOverride()` in `frontend/src/auth/cognito.ts`, is a pure function of that single env value:

- **Set**: `Amplify.configure(...)` includes a `userPoolEndpoint` override pointing at `cognito-local`, and `signIn()` is issued with `options: { authFlowType: "USER_PASSWORD_AUTH" }` — the only flow `cognito-local` supports.
- **Unset**: the function returns `{}`. No `userPoolEndpoint`, no `authFlowType` override — Amplify's own defaults apply exactly as they did before this feature: the real Cognito endpoint, and the default SRP (`USER_SRP_AUTH`) flow. This is the one part of the whole feature required to have zero effect on anyone not opting into local mode, and is verified (not just asserted) by both a unit test (`cognito.test.ts`) and a live browser check with the var unset (see Consequences).

**What diverges between local and production:**

- **Auth flow type**: `USER_PASSWORD_AUTH` locally vs. `USER_SRP_AUTH` in production. `infra/modules/api.yaml`'s real `UserPoolClient` only allows `ALLOW_USER_SRP_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH` — unchanged by this feature. The local pool's client (`local/cognito/seed.mjs`) only allows `ALLOW_USER_PASSWORD_AUTH` + refresh tokens, because that's the only flow `cognito-local` can serve.
- **MFA**: off on the local pool; `"ON"` (TOTP-capable) on the real pool (`infra/modules/api.yaml`'s `MfaConfiguration`). `cognito-local` cannot honor TOTP MFA at all, and only partially emulates SMS MFA (nothing is actually delivered without extra SMTP-equivalent config) — there's no value in partially emulating a flow the real pool doesn't even use, so the local pool runs with MFA off entirely rather than a half-working approximation.

**What's identical between local and production:** everything downstream of a successful sign-in. `AuthContext.tsx`'s state machine, RBAC-gated navigation and route guards, the Patients/Appointments/Audit Log screens, the deactivate-patient flow, and token handling (`tokenStore.ts`, the API client's `Authorization` header) all run the same code paths regardless of which branch of `resolveLocalAuthOverride()` produced the session. The login UI itself (`LoginPage.tsx`) is unchanged by this feature — same form, same `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` challenge handling (ADR-0006), same error rendering.

**Seed users** (`local/cognito/seed.mjs`, ticket 02): `local-admin` and `local-clinic-ops` ship with permanent passwords for fast day-to-day role-gated UI iteration. `local-new-hire` ships deliberately left in `FORCE_CHANGE_PASSWORD` status specifically to exercise the app's real first-sign-in / new-password screen — this was contingent on empirically confirming `cognito-local`'s `AdminCreateUser` actually produces that challenge state (its docs mark the API only "partially implemented," and don't say either way). Ticket 02 confirmed it live: `AdminCreateUser` without a follow-up `AdminSetUserPassword` leaves `UserStatus: FORCE_CHANGE_PASSWORD`, and `InitiateAuth` with `USER_PASSWORD_AUTH` returns a real `NEW_PASSWORD_REQUIRED` challenge before ever checking the submitted password — verified end-to-end through `RespondToAuthChallenge` producing real tokens. See `local/cognito/README.md` for the full empirical write-up.

**Tradeoffs considered and rejected:**

- **Weakening production to `USER_PASSWORD_AUTH` everywhere**, so local and production would use one identical flow. Rejected: this would remove SRP from production, where the password itself is never transmitted, in favor of a strictly weaker flow, purely to make local tooling simpler. `infra/modules/api.yaml` stays untouched by this feature specifically so adding local dev tooling never weakens the real security posture (spec user story #9) — a maintainer-facing convenience is not a reason to change what production actually does.
- **Dropping local Cognito emulation entirely** (e.g. requiring a real deployed pool, or a hand-rolled mock auth layer, for all local frontend work). Rejected: this is the exact problem the parent spec exists to solve — frontend iteration blocked on AWS account access and a prior `sam deploy`. A documented divergence that still exercises the real login UI and real downstream code paths is strictly better than no local sign-in path at all.

## Consequences

- **Nobody should mistake a passing local sign-in for proof that production SRP auth works.** Local testing cannot verify the SRP challenge-response flow at all — only a real deployed Cognito pool can. `local/cognito/README.md`'s "Known gaps" section states this explicitly, and this ADR is the discoverable reason a future contributor should find before assuming the local and production flows are equivalent (spec user stories #8, #10).
- **Live end-to-end verification performed for this ADR** (ticket 03, via a temporary Playwright install against `make auth-run` + `make frontend-run`): signed in as `local-admin`, `local-clinic-ops`, and `local-new-hire` (through the real `FORCE_CHANGE_PASSWORD` → new-password screen) against a running `cognito-local` instance through the actual login UI, confirmed RBAC-gated UI (the Deactivate button, the Audit Log nav link) differs correctly by role, and confirmed that leaving `VITE_COGNITO_LOCAL_ENDPOINT` unset produces byte-for-byte the same behavior ADR-0006 already established for production-shaped config (redirects to `/login`, shows the graceful "not configured" error in the form rather than crashing, with no `userPoolEndpoint` in the resulting Amplify config). This closes the "not independently confirmed" gap ADR-0006 and the research notes both flagged — Amplify v6 signing in against `cognito-local` was previously documented-but-unverified; it now is verified.
- **CI is unaffected.** `resolveLocalAuthOverride()` is the only unit-tested seam (`cognito.test.ts`, plain Vitest, no I/O); the actual sign-in round-trip against a live `cognito-local` instance is a human-run empirical check, not a CI-wired test (see spec Testing Decisions) — `npm run build` / `npm run lint` / `npm run test` all pass without `cognito-local` running.
- `local/cognito/`'s dependencies (`cognito-local`, `@aws-sdk/client-cognito-identity-provider`) stay out of `frontend/`'s production bundle — `cognito-local` is a `frontend/` devDependency (dev-time only, never imported by app code), and the seed script's SDK dependency lives in `local/cognito/`'s own `package.json`, entirely outside the Vite app's dependency graph.
