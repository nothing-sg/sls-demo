#!/usr/bin/env node
import { lookupTunnelUrl } from "./lookupTunnel.mjs";

const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 30_000;

/**
 * Polls ngrok's local API (via lookupTunnelUrl) for one tunnel name until it
 * reports a public_url or `deadline` passes. Used by `make tunnel-up` so it
 * only returns once ngrok's local API confirms a tunnel is actually up,
 * rather than assuming it came up as soon as the `ngrok http` process was
 * spawned (starting the process and the tunnel actually connecting are two
 * different events -- see local/ngrok/README.md).
 */
async function waitFor(name, deadline) {
  let last;
  while (Date.now() < deadline) {
    last = await lookupTunnelUrl(name);
    if (last.status === "found") return last.url;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `timed out after ${TIMEOUT_MS}ms waiting for tunnel "${name}" to come up` +
      (last ? ` (${last.reason})` : ""),
  );
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node waitForTunnels.mjs <tunnel-name> [tunnel-name...]");
  process.exit(2);
}

const deadline = Date.now() + TIMEOUT_MS;
try {
  const urls = await Promise.all(names.map((name) => waitFor(name, deadline)));
  names.forEach((name, i) => console.log(`${name}: ${urls[i]}`));
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
