#!/usr/bin/env bash
# Not `set -e`: killing an already-dead/missing process is not a failure
# here, and we want to clean up state either way.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

STATE_DIR="local/ngrok/.run"
PID_FILE="$STATE_DIR/ngrok.pid"

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then
    echo "Stopped ngrok (pid $pid, tunnels \"frontend\" + \"cognito-local\")."
  fi
  rm -f "$PID_FILE"
fi

rm -f "$STATE_DIR/ngrok.log" "$STATE_DIR/ngrok.yml"

echo "Tunnels stopped."
