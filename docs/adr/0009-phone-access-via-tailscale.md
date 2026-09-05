# ADR-0009: Phone access to local dev via Tailscale

## Status

Accepted — 2026-09-05

## Context

A developer running the local dev stack (`make frontend-run`, `make auth-run`, per ADR-0007/0008) had no way
to open the app on a phone to check real-mobile-viewport rendering or role-gated UI (the Deactivate button,
the Audit Log nav link — ADR-0004), because Vite's dev server bound to `localhost` only and the seeded
`VITE_COGNITO_LOCAL_ENDPOINT` value was hardcoded to `http://localhost:9229`, meaningless from a phone's own
browser. Binding to `0.0.0.0` and finding a LAN IP is the obvious first idea, but it's unreliable on exactly
the networks a developer is most likely to want phone testing on the go: coffee shops, airports, and hotels
routinely enable client/AP isolation, which blocks device-to-device traffic even when phone and laptop show
the same network name.

## Decision

One environment variable, `PHONE_HOST`, set to the developer's Tailscale hostname (e.g.
`my-mac.tailnet-name.ts.net`), gates two independent, env-var-conditional changes. Unset — the default —
both are no-ops and behavior is byte-for-byte identical to before this feature.

**Tailscale, not a public tunnel (e.g. ngrok).** This is a personal, two-device use case, and this repo is a
HIPAA/HITRUST-baseline healthcare product where local-dev tooling should default to the least exposure that
solves the problem. A public tunnel hands out a URL anyone with the link can reach; Tailscale is a private
mesh VPN between the developer's own two devices, with nothing exposed beyond them. Tailscale also gives the
whole machine one stable hostname across ports, so both `:5173` (Vite) and `:9229` (cognito-local) become
reachable from a single one-time device pairing, rather than needing a separate tunnel per port the way most
per-port tunnel tools would require. Installing and signing into Tailscale on both devices is a manual,
one-time step for the developer, deliberately left outside this feature's automatable scope — see
`README.md` / `local/cognito/README.md`.

**`frontend/vite.config.ts`: `host: true` plus a suffix-wildcard `allowedHosts` entry, gated on
`PHONE_HOST`.** The installed Vite version (5.4.21, confirmed by reading
`frontend/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js`'s `hostCheckMiddleware` /
`isHostAllowedWithoutCache`) 403s any request whose `Host` header isn't an IP literal, `localhost` /
`*.localhost`, or explicitly present in `server.allowedHosts` — this is real for the installed 5.4.x line,
not a docs-inferred assumption about some other major version. `isHostAllowedWithoutCache` treats an
`allowedHosts` entry starting with `.` as a suffix match (`hostname.endsWith(allowedHost)`), so a single
`".ts.net"` entry allows any hostname Tailscale hands out under that suffix, rather than pinning today's one
specific device name. This was chosen over pinning the exact current hostname specifically so that renaming
the Mac or the tailnet later doesn't silently break phone access until someone notices and remembers why —
the allowlist still only matches Tailscale's own domain suffix, not an arbitrary wildcard, so it doesn't
meaningfully widen what Vite will answer to. Verified empirically: with `PHONE_HOST` set to a synthetic
`*.ts.net` value, a request carrying that Host header returns 200 (previously would 403); an unrelated Host
header still 403s; with `PHONE_HOST` unset, `localhost` access still works and a `*.ts.net` Host header still
403s exactly as before this feature.

**`local/cognito/seed.mjs`: the value *written* to `VITE_COGNITO_LOCAL_ENDPOINT` changes; the value the
script itself connects with does not.** `resolveLocalAuthOverride()` (ADR-0007) is exercised by Amplify
running in the phone's own browser, so the endpoint the phone reads has to be a hostname the phone can
resolve — `localhost` from the phone's perspective means the phone itself. `LOCAL_ENDPOINT`
(`http://localhost:9229`), the value the script's own `CognitoIdentityProviderClient` connects to, stays
`localhost` regardless of `PHONE_HOST`: the seed script always runs on the same host as the `cognito-local`
container it's seeding (both launched by `make auth-run`), so it always reaches it via localhost — there is
no scenario where the seed script itself needs to reach cognito-local over Tailscale. Only the separate,
phone-facing `VITE_COGNITO_LOCAL_ENDPOINT` value written into `frontend/.env.local` switches to
`http://<PHONE_HOST>:9229`.

**`PHONE_HOST` is supplied explicitly, not auto-detected via the `tailscale` CLI.** Auto-detection (e.g.
shelling out to `tailscale status` or `tailscale ip`) was considered and rejected: it would make every
invocation of `make frontend-run` / `make auth-run` — including the overwhelming majority that don't want
phone access — depend on the `tailscale` binary being installed, on `PATH`, and already logged in, just to
look up a value that's cheap to fetch once and hand-copy into an env var. An explicit, opt-in env var also
matches this feature's central safety property (spec user story #4): the dev server should never become
reachable beyond `localhost` by accident. A CLI auto-detect path is one more way that guarantee could quietly
stop holding (e.g. `tailscale` present but logged into the wrong account, or a stale cached hostname).

**No Makefile changes.** `PHONE_HOST=<hostname> make frontend-run` / `make auth-run` already works with zero
edits to the `Makefile`: Make recipes run in a shell that inherits the invoking environment, so the variable
reaches `npm run dev` (Vite) and `node seed.mjs` the same way any other exported env var would. Verified
empirically by running both targets with `PHONE_HOST` set and confirming the resulting behavior (external
bind, correct allowlist, correct written endpoint) — see Consequences.

**No backend, Postgres, or `docker-compose.yml` changes.** The `/api` proxy target (`http://localhost:8000`)
is called by the Vite dev-server *process itself* (server-side, same machine) — the phone's browser never
talks to the backend directly, so only Vite's own port needs to become phone-reachable. `cognito-local`'s
container already binds `HOST=0.0.0.0` (ADR-0008), and was reconfirmed for this feature (see Consequences)
to already be reachable from a non-loopback interface with no compose changes.

## Consequences

- **Verified, not assumed:** with `PHONE_HOST` set to a synthetic Tailscale-shaped hostname
  (`test.example.ts.net`), `curl -H "Host: test.example.ts.net" http://127.0.0.1:5174/` (a throwaway port,
  to avoid touching another running dev server) returned `200`, and Vite printed a `Network:` address
  confirming the external bind; an unrelated `Host: evil.example.com` on the same server still 403'd. With
  `PHONE_HOST` unset, `http://localhost:5175/` still returned `200` and the same `*.ts.net` Host header still
  403'd — unset behavior is unchanged. `local/cognito/seed.mjs` run with `PHONE_HOST` set wrote
  `VITE_COGNITO_LOCAL_ENDPOINT=http://<PHONE_HOST>:9229` into `frontend/.env.local` while logging
  `Seeding cognito-local at http://localhost:9229 ...` (confirming the connection endpoint stayed localhost);
  the other two keys (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) were unaffected in both runs.
  `cognito-local`'s published port was confirmed reachable via this Mac's actual LAN IP
  (`ipconfig getifaddr en0`, not `127.0.0.1`) — a reasonable substitute for "reachable via a non-localhost
  interface," though **not** a literal Tailscale-interface test, since no Tailscale installation is available
  on this development machine.
- **Not verified — and cannot be, from this machine:** the ticket's true end-to-end criterion — a real phone,
  paired to a real tailnet, opening `http://<PHONE_HOST>:5173`, signing in with a seeded account, and
  confirming role-gated UI renders correctly on-device — requires Tailscale installed and signed into on two
  physical devices, which this environment does not have. This remains a manual step for the developer after
  reading this ADR and `README.md` / `local/cognito/README.md`'s `PHONE_HOST` section.
- Nobody should mistake the synthetic-Host-header / LAN-IP checks above for proof that a real Tailscale path
  works end to end — they confirm the *mechanism* (Vite's allowlist logic, the seed script's written value,
  the container's non-loopback bind) without needing real Tailscale, exactly as ADR-0007's local/production
  auth-flow divergence and ADR-0008's Docker Compose port-binding fix were each verified empirically rather
  than assumed from documentation.
- `PHONE_HOST` unset is the only configuration any CI job or automated test ever sees. Verified, not assumed:
  `make backend-lint`, `make backend-test`, `make frontend-lint`, `make frontend-test`, and `make
  frontend-build` were each run for real with `PHONE_HOST` unset and Tailscale entirely absent from the
  environment, and all five passed.
- A future Mac rename or tailnet rename changes the hostname Tailscale hands out, but not its `.ts.net`
  suffix, so the `allowedHosts` entry keeps working without a code change — only the developer's own
  `PHONE_HOST` value needs updating.
- This feature introduces no PHI or production-credential exposure: it only ever touches the same
  non-production, placeholder-credentialed `cognito-local` / Vite dev-server path ADR-0007 and ADR-0008
  already established, gated behind an env var that is never set in CI or in any deployed environment.
