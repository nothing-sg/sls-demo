# 01: ngrok tunnel lifecycle + shared URL-lookup utility

**What to build:** `make tunnel-up` starts two independently-identifiable ngrok tunnels — one fronting the frontend dev server, one fronting `cognito-local` — and waits until both are confirmed reachable via ngrok's local API. `make tunnel-down` stops them. A shared, unit-tested function can take ngrok's local API response and a tunnel name and return that tunnel's current public URL (or a clear "not found"/"not up yet" result) — this is the prefactor both ticket 02 and ticket 03 will build on, so neither duplicates the same lookup logic.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Whether ngrok's free tier actually supports two simultaneous tunnels from one agent is confirmed by trying it for real, not assumed — if it doesn't, this is written up as a finding (in the eventual ADR) rather than silently worked around.
- [ ] `make tunnel-up` starts both tunnels and only returns once ngrok's local API (`http://127.0.0.1:4040/api/tunnels`) reports both as present and reachable.
- [ ] `make tunnel-down` stops both tunnel processes cleanly.
- [ ] A shared, pure function exists (in a new `local/ngrok/` directory, mirroring `local/cognito/`'s existing role as this repo's home for local-only tooling) that takes an already-fetched tunnels API response and a tunnel name, and returns that tunnel's public URL.
- [ ] That function has unit tests covering: the named tunnel present and up (returns its URL), the named tunnel absent from the response, and an empty/malformed tunnels list (ngrok not fully started yet) — following the fixture-driven style of `frontend/src/auth/cognito.test.ts`.
- [ ] A one-time prerequisite (a free ngrok account + `ngrok config add-authtoken <token>`) is documented somewhere discoverable, since nothing in this ticket can automate that step.
- [ ] With `tunnel-up` never invoked, nothing about the existing `make` targets (`db-up`, `auth-run`, `frontend-run`, `backend-run`, etc.) changes behavior.
