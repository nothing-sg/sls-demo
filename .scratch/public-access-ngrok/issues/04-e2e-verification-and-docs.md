# 04: End-to-end verification + documentation

**What to build:** The actual user-facing outcome this spec exists for: with both tunnels up, opening the public frontend link, passing the Basic Auth gate, signing in with a seeded test account (`local-admin`, etc.), and landing in the real app with role-gated UI rendering correctly — verified together, not just each tunnel in isolation. Plus the documentation a future contributor needs: why this exists, why it reverses ADR-0009's Tailscale-over-ngrok reasoning on purpose, and the known gaps.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] With both `frontend-run-public` and `auth-run-public` running, opening the real public frontend URL, entering the Basic Auth password, and signing in with a seeded account succeeds end-to-end (a real request-response chain through both tunnels, not two isolated checks).
- [ ] Role-gated UI (e.g. the Deactivate button, the Audit Log nav link) renders correctly for the signed-in account's role.
- [ ] `docs/adr/0009-public-access-via-ngrok.md` written (reusing the number — the Tailscale-based ADR-0009 never merged), covering: ngrok chosen over Tailscale Funnel for this specific use case despite ADR-0009's (abandoned) preference for Tailscale in a different one; the exact-hostname-match vs. suffix-wildcard distinction and why ngrok's shared public domain requires it; the Basic-Auth-can't-cover-both-tunnels gap and why it's accepted; the auto-detect-vs-manual reversal relative to the abandoned Tailscale design, and why ngrok's every-session-rotating hostname makes auto-detection the correct call here even though explicit was correct there.
- [ ] `README.md` and/or `local/cognito/README.md` document the new `tunnel-up`/`tunnel-down`/`frontend-run-public`/`auth-run-public` targets and the one-time ngrok account/authtoken setup step.
- [ ] With none of this feature's targets ever invoked, `make backend-lint`, `make backend-test`, `make frontend-lint`, `make frontend-test`, and `make frontend-build` all still pass unchanged.
