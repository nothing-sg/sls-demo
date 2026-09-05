# ADR-0009: Public access to the local dev stack via ngrok

## Status

Accepted — 2026-09-05

## Context

A developer running the local dev stack (`make backend-run`, `make frontend-run`, plus the
Docker-based Postgres/`cognito-local` setup from ADR-0008) sometimes needs to share a live,
working demo with a third party — a colleague, a client — who has no access to the
developer's machine or network and won't install any device-pairing software. This is a
different problem from personal phone access: an earlier, unmerged PR (`#2`,
`feature/phone-access-tailscale`) proposed a Tailscale-Funnel-based ADR-0009 for reaching the
app from the *developer's own* phone. That PR never merged and its branch was deleted; nothing
it introduced exists on `main`. This ADR reuses the number `0009` deliberately (there is no
collision) and is a clean-slate design, not a diff against the abandoned branch — but because
it reaches an opposite tool conclusion for a superficially similar problem, the reasoning for
the reversal is recorded explicitly below so a future reader doesn't conclude one of the two
designs was simply wrong.

## Decision

### Scope

`make tunnel-up` starts two ngrok tunnels — fronting the frontend dev server (`:5173`) and
`cognito-local` (`:9229`) — the same two services the abandoned Tailscale design identified as
needing phone/public reachability. The backend (`:8000`) needs no tunnel: the frontend's
`/api` proxy calls it server-side, from the same machine, never from a remote browser. `make
frontend-run-public` / `make auth-run-public` each look up their tunnel's current public URL
from ngrok's local API (`http://127.0.0.1:4040/api/tunnels`) and wire it into the same
environment variable the existing `frontend-run` / `auth-run` recipes already expect, so
`vite.config.ts` and `local/cognito/seed.mjs` need only the same shape of "is an
externally-reachable hostname present" conditional ADR-0007 already established. This is
implemented in `local/ngrok/` (tickets 01–03, already merged onto this branch); see
`local/ngrok/README.md` for the full mechanism and its own empirical verification notes. This
ADR covers the *design rationale*, not the mechanism.

### ngrok over Tailscale Funnel, on purpose, for a different use case than ADR's abandoned counterpart

The abandoned Tailscale design and this one solve genuinely different problems, not the same
problem with a change of mind:

- **Personal phone access** (abandoned): the audience is the developer's *own* device.
  Tailscale's model — join a private tailnet, reach machines on it by name — fits perfectly:
  no public exposure at all, and the developer's phone is a real Tailscale client they already
  control.
- **Sharing with a third party** (this ADR): the audience is someone who does not have and
  will not install anything. Tailscale Funnel *can* expose a service publicly, but doing so
  means asking a third party to either join the developer's tailnet (defeating the "no special
  setup" requirement) or trust a Funnel link that still assumes Tailscale's model of identity
  and access. ngrok's model — a bare, freely-shareable HTTPS URL with no client software
  required on the recipient's end — is a direct fit for "send a link, get a password over a
  different channel, done."

Put differently: ADR's abandoned Tailscale design chose the tool that *avoids* public exposure
because its use case didn't need it. This ADR chooses the tool that provides public exposure
*because* its use case requires it. Both are the correct call for their respective audiences;
neither is a reversal of engineering judgment, only of the underlying requirement.

### Exact-hostname match, not a suffix wildcard, in `allowedHosts`

`frontend/vite.config.ts` allow-lists the frontend tunnel's *exact* current hostname (e.g.
`abcd1234.ngrok-free.app`), never a leading-dot suffix pattern. This is a deliberate departure
from a `.ts.net`-style suffix pattern, and the distinction matters for a concrete security
reason, not just style:

- `.ts.net` is a **private namespace**: Tailscale hands out subdomains under it only to
  machines already joined to one specific tailnet. A suffix wildcard there only ever matches
  hosts the developer's own tailnet controls.
- ngrok's free-tier domains (`*.ngrok-free.app`) are a **shared public suffix** used by every
  ngrok account on the planet. A suffix wildcard there (`.ngrok-free.app`) would accept a
  `Host` header claiming to be *anyone else's* unrelated ngrok tunnel, not just this session's
  — a completely different, much weaker security property than the Tailscale case.

Vite's own `allowedHosts` matching (`isHostAllowedWithoutCache`, confirmed by reading
`frontend/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js` in this repo's installed Vite
5.4.21) only treats a *leading-dot* entry as a suffix match; a bare hostname string is an exact
match — which is what `local/ngrok/frontendRunPublic.mjs` supplies. This was verified live for
this ADR (see Consequences): a request carrying the exact current tunnel hostname is allowed;
one carrying an unrelated `*.ngrok-free.app` hostname, a hostname with an extra prefix, or a
hostname with an extra suffix appended are all rejected with Vite's standard 403.

### Basic Auth gates the frontend tunnel only — a known, accepted gap

`make frontend-run-public` generates a fresh Basic Auth username/password every run and gates
the `frontend` ngrok tunnel with it (via ngrok's local agent API, recreating that tunnel with a
`basic_auth` field — see `local/ngrok/frontendRunPublic.mjs`). `cognito-local`'s tunnel is
**deliberately left ungated**. This is not an oversight: AWS Amplify's client-side `fetch`
calls to a Cognito-compatible endpoint carry no Basic Auth header at all, and there is no
Amplify auth-client change in scope for this feature to add one. Gating `cognito-local`'s
tunnel the same way would 401 every sign-in attempt through it, which would break the feature
entirely rather than harden it.

The accepted residual exposure is narrow: it only matters to someone who obtains the
`cognito-local` tunnel's URL *directly*, which requires already having gotten past the gated
frontend link (the two URLs aren't derivable from one another, and the `cognito-local` URL is
never shown to the recipient — only used internally by the browser's Amplify client). Someone
scanning ngrok's shared domain space blindly could, in principle, stumble onto an ungated
`cognito-local` tunnel and reach a Cognito-API-compatible surface backed only by local,
synthetic, non-production data (ADR-0007) — not a PHI or production-credential exposure (see
Consequences). This gap is deliberate, scoped, and documented here so it isn't "discovered"
and treated as a bug later.

### Auto-detected hostname, reversing the abandoned design's explicit-hostname choice — and why that reversal is correct here

The abandoned Tailscale design deliberately chose an **explicit**, manually-supplied hostname
over auto-detection. This design does the opposite: `local/ngrok/lookupTunnel.mjs` queries
ngrok's local API and `frontend-run-public` / `auth-run-public` wire in whatever it finds,
with no manual step. This is not an inconsistency between the two designs — it follows
directly from a difference in the underlying infrastructure:

- Tailscale's `.ts.net` hostnames are **stable**: a given machine keeps the same tailnet
  hostname across sessions. Auto-detecting a value that doesn't change buys nothing and adds a
  moving part; an explicit, written-down hostname is simpler and just as correct.
- ngrok's free tier has **no reserved/stable domain** (out of scope for this feature — see the
  spec's Out of Scope section). Every `tunnel-up` run, and in fact every
  `frontend-run-public` run specifically (since it recreates the `frontend` tunnel to attach
  Basic Auth), gets a brand-new random hostname. An explicit, manually-copied value would be
  wrong again the very next time anyone ran this — the exact toil user story #2 in the spec
  exists to eliminate. Auto-detection isn't a stylistic preference here; it's the only design
  that doesn't immediately go stale.

Same design principle in both cases — don't add a moving part unless the underlying thing
actually moves — applied to two infrastructures that differ on exactly that property.

### Two simultaneous tunnels: still not empirically confirmed in this environment

The spec requires this be confirmed by trying it, not assumed. It has now been attempted twice
across two separate implementation passes (ticket 01, and again for this ADR) and **both times
failed identically before reaching the question at all**: this environment has no ngrok
account or authtoken configured, so `ngrok start --all --config=...` (the single-agent,
two-tunnel-config invocation `local/ngrok/tunnel-up.sh` uses) fails immediately with
`ERR_NGROK_4018` ("this ngrok session is not authenticated") — confirmed live again for this
ADR by running `make tunnel-up` directly (see Consequences for the exact output). This failure
happens at the authentication step, before ngrok's edge ever evaluates how many tunnels the
account/plan allows, so it provides no signal either way about the two-simultaneous-tunnels
question. **This remains a genuinely open, unverified claim** — not a confirmed "yes," not a
confirmed "no." Whoever first runs `make tunnel-up` with a real authtoken configured should
confirm this directly (both tunnels reporting a `public_url` in `GET /api/tunnels`, not just
the process starting) and update this ADR and `local/ngrok/README.md`'s verification-status
section with the actual finding.

### Compliance posture

This feature introduces no PHI or production-credential exposure. It only ever tunnels the
same non-production, placeholder-credentialed local stack ADR-0007/0008 already established:
`cognito-local`'s seeded accounts are synthetic test users with placeholder passwords
documented in `local/cognito/README.md` (not secrets), and no patient data used locally is
real. Nothing in `backend`, Postgres, `docker-compose.yml`, or production Cognito changes.

## Consequences

- **A future reader diffing this against the abandoned Tailscale branch should not conclude
  either design is wrong.** Personal-device access and third-party sharing are different
  problems with different correct tools; see the reasoning above.
- **CI is unaffected.** No CI job exercises this feature; `ngrok`, an authtoken, and all of
  `local/ngrok/`'s tooling are entirely opt-in, developer-machine-only additions. `make
  backend-lint`, `backend-test`, `frontend-lint`, `frontend-test`, and `frontend-build` were
  all re-run for this ADR with none of `tunnel-up`/`tunnel-down`/`frontend-run-public`/
  `auth-run-public` ever invoked, and all five passed unchanged.
- **What was empirically verified for this ADR, live, in an environment with no ngrok
  authtoken configured** (same wall every prior ticket in this feature hit — confirmed again
  rather than assumed stale):
  - `make tunnel-up` fails immediately with `ERR_NGROK_4018`, identically to every prior
    ticket's finding. The two-simultaneous-tunnels question remains unverified (see above).
  - Because a real public ngrok URL could not be produced, the true end-to-end acceptance
    criterion — a third party opening the real public link, passing Basic Auth, signing in,
    and landing in the real app — **could not be performed as literally specified** and is not
    claimed as done. In its place, a combined substitute check was performed, chaining
    together (rather than isolating) the two `-public` targets' real, unmodified code:
    - A small local stand-in for ngrok's local API (a throwaway HTTP server, not part of this
      commit) was started on `127.0.0.1:4040`, reporting a `frontend` and a `cognito-local`
      tunnel already "up." The real, unmodified `node local/ngrok/frontendRunPublic.mjs` was
      then run against it: it generated fresh Basic Auth credentials, sent the real
      delete-then-recreate-with-`basic_auth` HTTP calls this design relies on (captured and
      confirmed to match ngrok's documented `POST /api/tunnels` shape — a JSON body with
      `name`, `proto`, `addr`, and `basic_auth: ["user:pass"]`), picked up the "recreated"
      tunnel's new hostname from the stand-in, and correctly launched Vite with that exact
      hostname wired into `allowedHosts`.
    - `curl` against the running Vite instance confirmed the exact-match property directly:
      the genuine tunnel hostname was allowed (`200`); a hostname with an extra prefix, one
      with an extra suffix, and an entirely unrelated `*.ngrok-free.app` hostname (the
      shared-public-suffix attack this design exists to prevent) were all rejected with Vite's
      standard 403 "this host is not allowed" response.
    - The real, unmodified `make auth-run-public` target was run against the same stand-in
      API, which reported the `cognito-local` tunnel's "public" URL as a local HTTP proxy on a
      distinct port (standing in for the network hop a real ngrok edge would provide, since no
      real one was reachable). `local/cognito/seed.mjs` wrote that proxy URL into
      `frontend/.env.local`'s `VITE_COGNITO_LOCAL_ENDPOINT`, exactly as it would with a real
      tunnel URL.
    - With both pieces wired together (frontend bound externally with the fake tunnel's
      `allowedHosts` entry, `cognito-local` reachable only through the stand-in proxy address),
      a real browser session signed in through the app's actual login screen as both
      `local-admin` and `local-clinic-ops`, confirmed via the browser's own network log that
      the Cognito sign-in call actually went to the stand-in proxy address (not a coincidental
      match with the plain local endpoint), and confirmed role-gated UI rendered correctly and
      differently for each: `local-admin` saw the "Audit Log" nav link and a "Deactivate"
      action on a registered patient; `local-clinic-ops` saw neither.
  - **What this does *not* prove**, and what remains a manual follow-up for whoever has a real
    ngrok account: that ngrok's actual edge enforces Basic Auth as documented (challenges an
    unauthenticated request, admits one with the right credentials), that a real public
    `*.ngrok-free.app` URL is reachable from outside the developer's machine, and the
    two-simultaneous-tunnels question above. `local/ngrok/README.md`'s "Empirical verification
    status" section tracks these same open items in more mechanical detail.
- **`local/ngrok/`'s dependencies stay isolated**, same pattern as `local/cognito/`
  (ADR-0007/0008): nothing here touches `frontend/`'s production dependency graph or bundle.
