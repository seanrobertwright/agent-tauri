#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI_PATH="$REPO_ROOT/bin/agent-tauri.js"

if [ ! -f "$CLI_PATH" ]; then
    echo "Could not find agent-tauri CLI at $CLI_PATH" >&2
    exit 1
fi

exec node "$CLI_PATH" "$@"
