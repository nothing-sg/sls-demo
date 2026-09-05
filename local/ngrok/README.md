# Local ngrok tunnels

Tooling for exposing the local dev stack's frontend dev server and `cognito-local` on
public HTTPS URLs via [ngrok](https://ngrok.com), so a developer can share a working demo
with a third party who has no special software installed. See
`.scratch/public-access-ngrok/spec.md` for the full feature spec (`docs/adr/0009-public-access-via-ngrok.md`
will carry the durable design rationale once ticket 04 lands).

This directory mirrors `local/cognito/`'s role as this repo's home for local-only,
non-production tooling.

## One-time prerequisite: an ngrok account + authtoken

**Not automated by anything here.** Before `make tunnel-up` will work:

1. Install the ngrok CLI: `brew install ngrok` (or see <https://ngrok.com/download>).
2. Sign up for a free ngrok account at <https://dashboard.ngrok.com/signup>.
3. Get your authtoken from <https://dashboard.ngrok.com/get-started/your-authtoken> and run,
   once, on your own machine:

   ```bash
   ngrok config add-authtoken <your-token>
   ```

Without this, `ngrok http ...` fails immediately with `ERR_NGROK_4018` ("this ngrok session
is not authenticated"), and `make tunnel-up` will fail the same way. This is the same
category of manual, credential-bearing, one-time step as ADR-0009's (abandoned) Tailscale
account sign-in — an agent should not and cannot do this on your behalf.

## Usage

```bash
make tunnel-up    # starts both tunnels, blocks until ngrok confirms both are up
make tunnel-down  # stops both tunnels
```

`tunnel-up` starts two independently-named ngrok tunnels:

| Name            | Forwards to             |
| --------------- | ------------------------ |
| `frontend`      | `localhost:5173` (Vite, `make frontend-run`) |
| `cognito-local` | `localhost:9229` (`cognito-local`, `make auth-run`) |

Both tunnels run inside a **single** `ngrok start --all --config=...` agent process, not
two separate `ngrok http` invocations. This matters: two independent `ngrok http` processes
are two independent agent *sessions*, each with its own local API — confirmed live, the
second process falls back to `127.0.0.1:4041` because the first has already bound the
well-known `:4040`. Since `findTunnelUrl.mjs`/`lookupTunnel.mjs` always query `:4040`, a
tunnel living on a fallback port would simply never be found. `ngrok start --all` reading a
generated config file (`local/ngrok/.run/ngrok.yml`, one `tunnels:` entry per name) is one
agent session managing both tunnels, both reported together under that one `:4040` API —
this part was verified by actually running it against this exact config shape and watching
its log for a single `starting web service ... addr=127.0.0.1:4040` line before it hits the
authtoken wall (see below).

It polls ngrok's local API until both tunnels report a `public_url`, then prints both URLs
and returns. If they fail to come up (most likely: no authtoken configured), it prints
ngrok's log, stops the process it started, and exits non-zero — it never leaves an orphaned
`ngrok` process running.

`tunnel-down` stops the ngrok process (by PID, recorded at `local/ngrok/.run/ngrok.pid`
while it runs) and cleans up its log/config files.

## What's in here

- `findTunnelUrl.mjs` / `findTunnelUrl.test.mjs` — the one piece of real branching logic:
  given an already-fetched ngrok API response and a tunnel name, find that tunnel's current
  `public_url` (or a clear "not found" result). Pure, unit-tested, no network I/O — run its
  tests with `npm test` in this directory (plain `node --test`, no dependencies).
- `lookupTunnel.mjs` — thin, deliberately untested wrapper: does the actual `fetch` against
  ngrok's local API and hands the result to `findTunnelUrl()`. Usable directly as a CLI
  (`node local/ngrok/lookupTunnel.mjs <tunnel-name>`) — this is the seam ticket 02/03's
  `frontend-run-public` / `auth-run-public` targets are expected to reuse, so neither
  duplicates this lookup.
- `waitForTunnels.mjs` — polls `lookupTunnel.mjs` for one or more tunnel names until each
  reports a `public_url` or a 30s timeout elapses. Used by `tunnel-up.sh`.
- `tunnel-up.sh` / `tunnel-down.sh` — the actual process lifecycle `make tunnel-up` /
  `make tunnel-down` call into. `tunnel-up.sh` generates `local/ngrok/.run/ngrok.yml` (a
  two-tunnel ngrok config) and starts one `ngrok start --all` process from it; `tunnel-down.sh`
  stops that one process and removes the generated files.
- `frontendRunPublic.mjs` — `make frontend-run-public`'s orchestrator (ticket 02). Requires
  `tunnel-up` to already be running (fails with a message pointing at `make tunnel-up`
  otherwise, via `lookupTunnelUrl()`). Generates a fresh Basic Auth username/password every
  time it runs and gates the `frontend` tunnel with it by deleting and recreating *only* that
  tunnel through ngrok's local agent API (not by editing `tunnel-up.sh`'s config file, which
  wouldn't affect an already-running agent without also restarting the sibling
  `cognito-local` tunnel — see the comment at the top of the file for the full reasoning).
  Prints the credentials and the tunnel's current URL to the terminal (never to a file, and
  note the URL is freshly re-minted at this step, not whatever `tunnel-up` printed earlier),
  then execs `npm run dev` in `frontend/` with the exact tunnel hostname wired into Vite's
  `allowedHosts` (see `frontend/vite.config.ts`).

## Empirical verification status (see also the top-level task report)

- The local API's shape when **no** tunnels are up was confirmed live against a real
  (unauthenticated) `ngrok` agent: `GET http://127.0.0.1:4040/api/tunnels` →
  `{"tunnels":[],"uri":"/api/tunnels"}`. `findTunnelUrl()`'s "empty/malformed list" test case
  matches this exactly.
- The shape of an **up** tunnel entry (`name`, `public_url`, `proto`, `config.addr`, …) is
  corroborated by ngrok's own published API docs (<https://ngrok.com/docs/agent/api/>), not
  by an actually-running tunnel in this environment — this environment has no ngrok
  authtoken configured (see prerequisite above), and `ngrok http` fails with `ERR_NGROK_4018`
  before a tunnel can ever reach "up." Whoever first runs `make tunnel-up` with a real
  authtoken configured should sanity-check a live `GET /api/tunnels` response against the
  fixture in `findTunnelUrl.test.mjs` and flag it here if anything differs.
- Whether ngrok's free tier supports two simultaneous tunnels from one agent account is
  **not verified** in this environment for the same reason — it could not be tested without
  an authtoken. `tunnel-up.sh` is written to start both regardless and will surface whatever
  ngrok's actual response is (a second tunnel refused, a plan-upgrade prompt, etc.) via
  `waitForTunnels.mjs`'s timeout-and-log-dump path; it does not currently special-case that
  failure mode. Confirm this for real the first time an authtoken is available, and update
  this section (and the eventual ADR) with the actual finding.
- `frontendRunPublic.mjs`'s delete-then-recreate-with-`basic_auth` call against
  `POST http://127.0.0.1:4040/api/tunnels` (ticket 02) is **not verified against a live
  tunnel** for the same no-authtoken reason — a "frontend" tunnel never reaches "up" in this
  environment, so there's nothing to delete/recreate. The `basic_auth` field name and its
  `["user:pass", ...]` shape are corroborated by ngrok's published agent-config-v2 docs
  (<https://ngrok.com/docs/agent/config/v2/#tunnel-configurations>) and by the agent API docs'
  statement that `POST /api/tunnels`' "parameter names and behaviors are identical to those
  defined in the configuration file" (<https://ngrok.com/docs/agent/api/>) — not by an actual
  successful call. What *was* verified independently of a live tunnel: Vite's `allowedHosts`
  exact-match behavior (a real `vite` dev server, started with `NGROK_FRONTEND_HOST` set to a
  synthetic hostname, accepts a `curl` request carrying that exact `Host` header and rejects
  one carrying a different host or a suffix of it) — see the top-level task report for the
  exact commands. Whoever first runs `make frontend-run-public` with a real authtoken
  configured should confirm the recreate-with-`basic_auth` call actually gates the tunnel as
  expected and flag it here (and in the eventual ADR) if ngrok's actual behavior differs.
