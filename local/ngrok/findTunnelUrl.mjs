/**
 * The one piece of genuine branching logic in this feature: given an
 * already-fetched ngrok local-API response (`GET
 * http://127.0.0.1:4040/api/tunnels`) and a tunnel name, find that tunnel's
 * current public URL.
 *
 * Pure, no network I/O -- the actual `fetch` against ngrok's local API lives
 * in `lookupTunnel.mjs`, a thin untested wrapper around this function. This
 * mirrors `frontend/src/auth/cognito.ts`'s `resolveLocalAuthOverride()`
 * pure-function-plus-fixture-tests seam (ADR-0007): isolate the one decision
 * point, unit test it, leave the I/O around it empirically verified instead.
 *
 * Confirmed empirically against a real (unauthenticated, tunnel-less) ngrok
 * agent that the local API responds with `{"tunnels":[],"uri":"/api/tunnels"}`
 * when no tunnels are up. The shape of an *up* tunnel entry below (`name`,
 * `public_url`, `proto`, `config.addr`) is corroborated by ngrok's own API
 * docs (https://ngrok.com/docs/agent/api/) -- this environment has no
 * configured ngrok authtoken, so a tunnel that actually reaches "up" with a
 * `public_url` could not be produced to inspect directly (see
 * local/ngrok/README.md for that limitation).
 *
 * @typedef {{ status: "found", url: string }} TunnelFound
 * @typedef {{ status: "not_found", reason: string }} TunnelNotFound
 * @typedef {TunnelFound | TunnelNotFound} TunnelLookupResult
 */

/**
 * @param {unknown} tunnelsResponse parsed JSON body of ngrok's local
 *   `GET /api/tunnels` response (or anything -- malformed/missing input is
 *   handled as "not found", not thrown)
 * @param {string} name the tunnel's `--name` (or config `name:` key)
 * @returns {TunnelLookupResult}
 */
export function findTunnelUrl(tunnelsResponse, name) {
  const tunnels = tunnelsResponse?.tunnels;

  if (!Array.isArray(tunnels)) {
    return {
      status: "not_found",
      reason: `ngrok's local API response has no "tunnels" array (got: ${JSON.stringify(tunnelsResponse)}) -- ngrok may not be running, or may not have finished starting up yet`,
    };
  }

  if (tunnels.length === 0) {
    return {
      status: "not_found",
      reason: `ngrok is running but reports zero tunnels -- "${name}" hasn't come up yet (or ngrok failed to start it; check its log)`,
    };
  }

  const tunnel = tunnels.find((t) => t?.name === name);
  if (!tunnel) {
    const seen = tunnels.map((t) => t?.name).join(", ") || "(none)";
    return {
      status: "not_found",
      reason: `no tunnel named "${name}" among ngrok's current tunnels: ${seen}`,
    };
  }

  if (!tunnel.public_url) {
    return {
      status: "not_found",
      reason: `tunnel "${name}" is present but has no public_url yet -- it may still be connecting`,
    };
  }

  return { status: "found", url: tunnel.public_url };
}
