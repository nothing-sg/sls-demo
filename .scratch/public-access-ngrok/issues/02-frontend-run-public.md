# 02: frontend-run-public

**What to build:** With tunnels up (ticket 01), `make frontend-run-public` looks up the frontend tunnel's current public URL via the shared lookup utility, starts Vite bound externally and allow-listing that exact hostname (not a suffix wildcard — ngrok's domain is a shared public namespace, unlike Tailscale's private `.ts.net`, so an exact match is required), and gates the whole thing behind a freshly generated Basic Auth username/password printed to the terminal. Anyone opening the real public URL is challenged for that password before reaching anything, including the login screen.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `make frontend-run-public` fails with a clear message pointing at `make tunnel-up` if the frontend tunnel isn't up yet, rather than silently falling back to `localhost`.
- [ ] With the tunnel up, Vite binds externally and `allowedHosts` accepts exactly the current session's frontend tunnel hostname.
- [ ] A request through the real public ngrok URL (not just a synthetic `curl` with a spoofed `Host` header against `localhost`) reaches the dev server.
- [ ] The Basic Auth password is generated fresh each time `tunnel-up` runs (not a fixed/documented value) and printed to the terminal, not written to any file.
- [ ] An unauthenticated request to the public URL is challenged for credentials; a request carrying the printed credentials succeeds.
- [ ] With `frontend-run-public` never invoked, `make frontend-run`'s behavior is completely unchanged.
- [ ] `make frontend-lint`, `make frontend-test`, and `make frontend-build` all still pass unchanged.
