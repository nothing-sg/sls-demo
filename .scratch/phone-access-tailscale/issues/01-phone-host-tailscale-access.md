# 01: Add PHONE_HOST opt-in for phone access via Tailscale

**What to build:** A developer installs and signs into Tailscale on their phone and Mac (manual, one-time setup, outside this ticket's scope), then sets one environment variable, `PHONE_HOST=<their-tailscale-hostname>`, before running the existing `make frontend-run` and `make auth-run` targets. With it set, the developer can open the app on their phone's browser (connected to the same tailnet, regardless of which physical network either device is actually on), complete a real local sign-in with a seeded account, and see role-gated UI (the Deactivate button, the Audit Log nav link) render correctly — exercising the same real login UI and downstream code paths as desktop local testing (ADR-0007). With `PHONE_HOST` unset, both targets behave exactly as they do today, with zero change.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] With `PHONE_HOST` unset, `make frontend-run` and `make auth-run` produce byte-for-byte the same behavior as before this ticket (dev server localhost-only, seeded endpoint is `http://localhost:9229`) — confirmed by actually diffing behavior, not assumed from the code.
- [ ] With `PHONE_HOST` set to a real Tailscale hostname, the Vite dev server binds externally and accepts a request carrying that hostname as its `Host` header (no 403 "Blocked request..."), which the installed Vite version (5.4.21) would otherwise return for any host not in `allowedHosts`.
- [ ] The `allowedHosts` entry matches on the `.ts.net` suffix generally, not the one specific current hostname, so a later Tailscale device/tailnet rename doesn't silently break this.
- [ ] `local/cognito/seed.mjs`, run with `PHONE_HOST` set, writes `http://<PHONE_HOST>:9229` into `frontend/.env.local`'s `VITE_COGNITO_LOCAL_ENDPOINT` key instead of the hardcoded `http://localhost:9229`; the other two keys (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) and the "only these three keys are touched" contract (`local/cognito/README.md`) are unaffected.
- [ ] No changes made to the backend (`uvicorn`), Postgres, or `docker-compose.yml`'s service definitions.
- [ ] The `cognito-local` container is confirmed reachable via the Mac's actual Tailscale-assigned network interface (not just `localhost` or a Docker-internal check) — verified empirically, not assumed from the pre-existing `HOST=0.0.0.0` fix in ADR-0008.
- [ ] End-to-end verified from a real phone with Tailscale installed and connected to the same tailnet: opening `http://<PHONE_HOST>:5173`, signing in with a seeded account (e.g. `local-admin`/`LocalAdmin123!`), and confirming role-gated UI renders correctly.
- [ ] `make backend-lint`, `make backend-test`, `make frontend-lint`, `make frontend-test`, and `make frontend-build` all still pass unchanged.
- [ ] `docs/adr/0009-phone-access-via-tailscale.md` written, documenting why Tailscale was chosen over a public tunnel (e.g. ngrok), why the host-allowlist is a suffix wildcard rather than a pinned hostname, and why the hostname is supplied explicitly via `PHONE_HOST` rather than auto-detected via the `tailscale` CLI.
- [ ] `README.md` and/or `local/cognito/README.md` documents `PHONE_HOST` and the one-time Tailscale install/sign-in step required on both devices.
