# 03: auth-run-public

**What to build:** With tunnels up (ticket 01), `make auth-run-public` looks up the `cognito-local` tunnel's current public URL via the shared lookup utility and seeds `cognito-local` so that `frontend/.env.local`'s `VITE_COGNITO_LOCAL_ENDPOINT` points at that public URL instead of `localhost` — necessary because Amplify's client-side auth calls hit this endpoint directly from wherever the browser actually is, not proxied server-side the way `/api` is.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `make auth-run-public` fails with a clear message pointing at `make tunnel-up` if the `cognito-local` tunnel isn't up yet, rather than silently seeding `localhost`.
- [ ] With the tunnel up, seeding writes the `cognito-local` tunnel's current public URL into `VITE_COGNITO_LOCAL_ENDPOINT`; the other two keys (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) and the "only these three keys are touched" contract are unaffected.
- [ ] The seed script's own connection to `cognito-local` stays `localhost` regardless — only the value *written* for later phone/browser use changes, mirroring the same distinction ADR-0009's (abandoned) design made for `LOCAL_ENDPOINT` vs. the written value.
- [ ] Verified with a raw SDK call (e.g. `InitiateAuth`) made against the tunneled `cognito-local` endpoint directly, succeeding independently of whether the frontend is tunneled yet.
- [ ] `cognito-local`'s tunnel has no Basic Auth or other gate — this is a known, accepted, documented gap (Amplify's calls carry no such credentials), not something this ticket needs to close.
- [ ] With `auth-run-public` never invoked, `make auth-run`'s behavior is completely unchanged.
- [ ] `make backend-lint` and `make backend-test` are unaffected (this ticket touches no backend code).
