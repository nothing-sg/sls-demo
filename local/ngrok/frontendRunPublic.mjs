#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { lookupTunnelUrl, NGROK_LOCAL_API } from "./lookupTunnel.mjs";

// `make frontend-run-public`'s orchestrator. See local/ngrok/README.md for
// the tunnel lifecycle this builds on (`make tunnel-up`/`tunnel-down`) and
// .scratch/public-access-ngrok/spec.md for the full feature.
//
// Responsibilities (all three belong here, not in tunnel-up.sh -- see the
// "why not tunnel-up.sh" note below):
//   1. Fail fast, pointing at `make tunnel-up`, if the "frontend" tunnel
//      isn't up yet -- never silently fall back to localhost.
//   2. Generate a fresh Basic Auth username/password and gate the "frontend"
//      tunnel with it.
//   3. Start Vite bound externally, with `allowedHosts` set to the exact
//      (possibly just-changed, see below) current tunnel hostname, then
//      hand off to it.
//
// Why gating happens here via ngrok's local agent API, not by adding
// `basic_auth` to tunnel-up.sh's generated config file:
//   `ngrok start --all --config=...` (what tunnel-up.sh runs) only applies a
//   tunnel's `basic_auth` when the AGENT STARTS, by reading the config file
//   at that moment. Editing the file after the agent is already running
//   doesn't affect the live "frontend" tunnel, and restarting the whole
//   agent process to pick up an edit would also tear down the sibling
//   "cognito-local" tunnel ticket 03 depends on -- lifecycle that
//   tunnel-up/tunnel-down alone should own, independently of this target.
//   Instead this deletes and recreates ONLY the "frontend" tunnel through
//   ngrok's local agent API (the same http://127.0.0.1:4040 API
//   lookupTunnel.mjs already reads from), passing `basic_auth` inline on
//   that one request. "cognito-local" and the agent process itself are
//   never touched -- consistent with the spec's explicit "Basic Auth gates
//   the frontend tunnel only" requirement (ticket 03 leaves cognito-local
//   ungated; Amplify's client-side calls to it carry no Basic Auth header).
//   This also means the credentials never touch disk: they exist only in
//   this process's memory, this terminal's output, and the in-flight
//   request body below -- never written to a file, per the ticket's
//   requirement.
//
// A side effect of recreating the tunnel: ngrok's free tier has no
// reserved/stable domain, so the recreated "frontend" tunnel gets a NEW
// random public_url, different from whatever `make tunnel-up` printed
// earlier. That's fine -- Vite can't have been reachable through the old
// URL anyway (allowedHosts wasn't wired up until this script runs), so the
// URL only becomes meaningful *after* this step. This script prints the
// final, actually-current URL below; that's the one to share, not
// `tunnel-up`'s earlier output.
//
// NOT verified against a live tunnel in this environment: there is no ngrok
// authtoken configured here (see local/ngrok/README.md), so `ngrok http`
// fails with ERR_NGROK_4018 before any tunnel reaches "up", and the
// delete+recreate-with-basic_auth call below has never been exercised
// against a real running agent. The `basic_auth` field name and its
// "array of "user:pass" strings, 8+ char password" shape are corroborated
// by ngrok's published agent-config-v2 docs
// (https://ngrok.com/docs/agent/config/v2/#tunnel-configurations) and by the
// agent API docs' statement that POST /api/tunnels' "parameter names and
// behaviors are identical to those defined in the configuration file"
// (https://ngrok.com/docs/agent/api/) -- not by an actual successful call.
// Whoever first runs this with a real authtoken configured should confirm
// the POST below succeeds as expected and flag it here (and in the eventual
// ADR) if ngrok's actual behavior differs.

const TUNNEL_NAME = "frontend";
const FRONTEND_PORT = process.env.FRONTEND_PORT ?? "5173";
const CREATE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

function randomUsername() {
  return `demo-${randomBytes(3).toString("hex")}`;
}

function randomPassword() {
  // 24 hex chars -- well over ngrok's documented 8-character Basic Auth
  // password minimum.
  return randomBytes(12).toString("hex");
}

async function recreateFrontendTunnelWithBasicAuth(username, password) {
  // NGROK_LOCAL_API (from lookupTunnel.mjs) is already .../api/tunnels.
  const apiBase = NGROK_LOCAL_API;

  // Best-effort: tear down the existing (ungated) "frontend" tunnel first.
  // Ignore failures here -- if it's already gone for any reason, the POST
  // below still (re)creates it.
  await fetch(`${apiBase}/${TUNNEL_NAME}`, { method: "DELETE" }).catch(() => {});

  const response = await fetch(apiBase, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: TUNNEL_NAME,
      proto: "http",
      addr: String(FRONTEND_PORT),
      basic_auth: [`${username}:${password}`],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `ngrok's local API rejected re-creating the "${TUNNEL_NAME}" tunnel with Basic Auth ` +
        `(HTTP ${response.status}): ${body || "(no response body)"}`,
    );
  }
}

async function waitForFreshUrl(deadline) {
  let last;
  while (Date.now() < deadline) {
    last = await lookupTunnelUrl(TUNNEL_NAME);
    if (last.status === "found") return last.url;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `timed out after ${CREATE_TIMEOUT_MS}ms waiting for the re-created "${TUNNEL_NAME}" tunnel ` +
      `to come back up${last ? ` (${last.reason})` : ""}`,
  );
}

async function main() {
  const existing = await lookupTunnelUrl(TUNNEL_NAME);
  if (existing.status !== "found") {
    console.error(`frontend-run-public: the "${TUNNEL_NAME}" ngrok tunnel isn't up (${existing.reason}).`);
    console.error("Run `make tunnel-up` first, then retry `make frontend-run-public`.");
    process.exit(1);
  }

  const username = randomUsername();
  const password = randomPassword();

  try {
    await recreateFrontendTunnelWithBasicAuth(username, password);
  } catch (err) {
    console.error(`frontend-run-public: ${err.message}`);
    console.error(
      "This could not be verified against a live tunnel in this environment (no ngrok " +
        "authtoken configured -- see local/ngrok/README.md). If ngrok's actual API shape " +
        "differs from what this script assumes, that's the likely cause.",
    );
    process.exit(1);
  }

  let url;
  try {
    url = await waitForFreshUrl(Date.now() + CREATE_TIMEOUT_MS);
  } catch (err) {
    console.error(`frontend-run-public: ${err.message}`);
    process.exit(1);
  }

  const hostname = new URL(url).hostname;

  console.log("");
  console.log("Frontend tunnel is up and gated with fresh Basic Auth credentials:");
  console.log(`  URL:      ${url}`);
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log("");
  console.log(
    "Share the URL and password with your recipient through two different channels " +
      "(e.g. the link in chat, the password read aloud) -- see .scratch/public-access-ngrok/spec.md.",
  );
  console.log("These credentials are not written to any file and will not be shown again.");
  console.log("");

  const frontendDir = fileURLToPath(new URL("../../frontend", import.meta.url));
  const child = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: { ...process.env, NGROK_FRONTEND_HOST: hostname },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

main().catch((err) => {
  console.error(`frontend-run-public: unexpected error: ${err.stack ?? err.message}`);
  process.exit(1);
});
