#!/usr/bin/env node
import { findTunnelUrl } from "./findTunnelUrl.mjs";

export const NGROK_LOCAL_API = "http://127.0.0.1:4040/api/tunnels";

/**
 * Thin, deliberately untested wrapper around findTunnelUrl(): does the
 * actual fetch against ngrok's local API, then hands the parsed body to the
 * pure lookup function. See findTunnelUrl.mjs / findTunnelUrl.test.mjs for
 * the tested decision logic -- this file is the "isolate the branching,
 * don't unit-test the I/O" half of that split (same split ADR-0007 used for
 * resolveLocalAuthOverride() vs. the live sign-in round-trip). Verified by
 * running it, not by a test double: `make tunnel-up` calls this indirectly
 * via waitForTunnels.mjs.
 *
 * @param {string} name tunnel name (its `--name` flag)
 * @param {string} [apiUrl] override for ngrok's local API, for manual testing
 * @returns {Promise<import("./findTunnelUrl.mjs").TunnelLookupResult>}
 */
export async function lookupTunnelUrl(name, apiUrl = NGROK_LOCAL_API) {
  let response;
  try {
    response = await fetch(apiUrl);
  } catch (err) {
    return {
      status: "not_found",
      reason: `could not reach ngrok's local API at ${apiUrl} -- is \`make tunnel-up\` running? (${err.message})`,
    };
  }

  if (!response.ok) {
    return {
      status: "not_found",
      reason: `ngrok's local API at ${apiUrl} returned HTTP ${response.status}`,
    };
  }

  const body = await response.json();
  return findTunnelUrl(body, name);
}

// CLI: `node lookupTunnel.mjs <tunnel-name>` prints the tunnel's current
// public URL to stdout and exits 0, or prints the reason to stderr and
// exits 1. Used by tunnel-up.sh to report the URLs once both are up, and
// intended for reuse by ticket 02/03's frontend-run-public /
// auth-run-public targets so neither duplicates this lookup.
if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: node lookupTunnel.mjs <tunnel-name>");
    process.exit(2);
  }
  const result = await lookupTunnelUrl(name);
  if (result.status === "found") {
    console.log(result.url);
    process.exit(0);
  } else {
    console.error(result.reason);
    process.exit(1);
  }
}
