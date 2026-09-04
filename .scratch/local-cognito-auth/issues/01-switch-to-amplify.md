Status: ready-for-agent
Type: AFK
Blocked by: None - can start immediately

# Switch frontend auth to AWS Amplify (production behavior unchanged)

## Parent

.scratch/local-cognito-auth/spec.md

## What to build

Replace `amazon-cognito-identity-js` with AWS Amplify's Auth module (`aws-amplify` v6, modular `aws-amplify/auth` import surface) in `frontend/src/auth/`. Production behavior must be unchanged: same default SRP (`USER_SRP_AUTH`) authentication flow, same real Cognito endpoint, no changes to `infra/modules/api.yaml`. Only the client library issuing the same protocol changes.

Amplify is configured once via `Amplify.configure(...)` with `userPoolId` and `userPoolClientId` (sourced from the existing `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` env vars — do not rename them).

New-password challenge handling (Cognito's `NEW_PASSWORD_REQUIRED` challenge, hit on every admin-provisioned account's first sign-in) moves from `amazon-cognito-identity-js`'s `newPasswordRequired` callback to Amplify's shape: `signIn()` returns `nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"`, resolved via `confirmSignIn({ challengeResponse: newPassword })`. `frontend/src/pages/LoginPage.tsx`'s two-step UI (sign-in form, then new-password form) stays structurally the same — only the underlying calls change.

Session restore (on page load) uses `fetchAuthSession()`; the `custom:role` claim is read from the ID token's decoded payload, same as before.

Also write ADR-0006, documenting this switch. It should explain: why (AWS's own current documentation, and `amazon-cognito-identity-js`'s own npm page, recommend migrating to Amplify's Auth features), and that it supersedes the specific client-library rationale in ADR-0005 (which chose `amazon-cognito-identity-js` for being lighter/less opinionated — note in the new ADR that Amplify v6's modular imports address that concern: its Auth-only bundle is reported to be meaningfully lighter than v5's, via real tree-shaking, not the "everything" import older Amplify versions required). Follow this repo's existing ADR format and numbering convention (see `docs/adr/0001`–`0005`).

Research notes with the exact Amplify API shapes already verified (config field names, function signatures, challenge-step values) are at `/tmp/sls-best-practice-implement-spec/research.md` — read that before exploring further; it should answer most API-shape questions without needing to re-derive them from `node_modules` or the internet.

## Acceptance criteria

- [ ] `amazon-cognito-identity-js` is removed from `frontend/package.json`; `aws-amplify` is the only Cognito client dependency
- [ ] `frontend/src/auth/cognito.ts`, `AuthContext.tsx` use Amplify's `signIn`/`confirmSignIn`/`signOut`/`fetchAuthSession` instead of the old library
- [ ] `LoginPage.tsx` still presents the same two-step UI (sign-in, then new-password-if-challenged) with no structural rewrite, just updated calls
- [ ] `custom:role` claim is still read correctly from the ID token and drives `CurrentUser.role` the same way as before
- [ ] No changes to `infra/modules/api.yaml` or any other backend/infra file
- [ ] `npm run build`, `npm run lint`, `npm run test` all pass in `frontend/`
- [ ] Production JS bundle size does not regress versus the last measurement on `main` (check `npm run build`'s output; the `amazon-cognito-identity-js`-era main chunk was ~571KB / ~183KB gzip — confirm the Amplify-based build is not larger, ideally smaller given Amplify's stated tree-shaking improvements)
- [ ] `docs/adr/0006-*.md` is written per the description above
- [ ] Note honestly in the ADR (and in your final report) that this cannot be verified against a real deployed Cognito User Pool — no AWS account is available in this environment — so verification is via code review + build/lint/test + the existing (unit-tested) behavior, matching this project's already-disclosed limitation on that front (see ADR-0005's "Consequences" section)

## Blocked by

None - can start immediately
