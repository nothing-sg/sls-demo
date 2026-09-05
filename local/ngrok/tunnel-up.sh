#!/usr/bin/env bash
set -euo pipefail

# Starts two independently-identifiable ngrok tunnels -- one fronting the
# frontend dev server, one fronting cognito-local -- and blocks until
# ngrok's local API (http://127.0.0.1:4040/api/tunnels) confirms both are
# up. `make tunnel-up` calls this. See local/ngrok/README.md for the
# one-time ngrok account/authtoken prerequisite this does NOT automate.
#
# Both tunnels are started from a SINGLE `ngrok start --all` process reading
# a generated config file, not two separate `ngrok http` invocations.
# Verified live: two independent `ngrok http` processes are two independent
# agent sessions, each with its OWN local API -- the second falls back to
# 127.0.0.1:4041 because :4040 is already taken by the first (confirmed by
# watching its log: `msg="can't bind default web address, trying
# alternatives" obj=web addr=127.0.0.1:4040`). Since ngrok's local API is
# always queried at the well-known :4040 address (findTunnelUrl.mjs /
# lookupTunnel.mjs), a second tunnel living on :4041 would simply never be
# found. A single `ngrok start --all --config=...` process, by contrast, is
# one agent session managing multiple named tunnels, all reported together
# under that one process's :4040 API -- confirmed by running it against this
# config shape and observing a single "starting web service ... addr=
# 127.0.0.1:4040" log line covering both tunnel definitions (auth still
# fails past that point in this environment -- see README.md).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Ports match docker-compose.yml (cognito-local: 9229) and Vite's default
# (frontend, `make frontend-run` -> `vite`: 5173) -- overridable via env for
# anyone running either dev server on a non-default port.
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
COGNITO_PORT="${COGNITO_PORT:-9229}"

STATE_DIR="local/ngrok/.run"
mkdir -p "$STATE_DIR"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok CLI not found. Install it (e.g. \`brew install ngrok\`), then run" >&2
  echo "\`ngrok config add-authtoken <token>\` once with your own free ngrok account's" >&2
  echo "token -- see local/ngrok/README.md." >&2
  exit 1
fi

CONFIG_FILE="$STATE_DIR/ngrok.yml"
cat >"$CONFIG_FILE" <<EOF
version: "3"
tunnels:
  frontend:
    proto: http
    addr: $FRONTEND_PORT
  cognito-local:
    proto: http
    addr: $COGNITO_PORT
EOF

echo "Starting ngrok (tunnel \"frontend\" -> localhost:$FRONTEND_PORT, \"cognito-local\" -> localhost:$COGNITO_PORT) ..."
ngrok start --all --config "$CONFIG_FILE" --log=stdout --log-format=logfmt \
  >"$STATE_DIR/ngrok.log" 2>&1 &
echo $! >"$STATE_DIR/ngrok.pid"

echo "Waiting for ngrok's local API to confirm both tunnels are up..."
if ! node local/ngrok/waitForTunnels.mjs frontend cognito-local; then
  echo "" >&2
  echo "tunnel-up failed to bring both tunnels up -- see the log below, then" >&2
  echo "local/ngrok/README.md (a missing/invalid ngrok authtoken is the most" >&2
  echo "likely cause). Stopping anything that did start." >&2
  echo "--- $STATE_DIR/ngrok.log ---" >&2
  cat "$STATE_DIR/ngrok.log" >&2 2>/dev/null || true
  "$REPO_ROOT/local/ngrok/tunnel-down.sh" || true
  exit 1
fi

echo ""
echo "Both tunnels are up."
