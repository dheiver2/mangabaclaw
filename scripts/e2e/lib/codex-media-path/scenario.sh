#!/usr/bin/env bash
set -euo pipefail

source scripts/lib/mangabaclaw-e2e-instance.sh
mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}"
export MANGABACLAW_SKIP_CHANNELS=1
export MANGABACLAW_SKIP_GMAIL_WATCHER=1
export MANGABACLAW_SKIP_CRON=1
export MANGABACLAW_SKIP_CANVAS_HOST=1
export MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER=1
export MANGABACLAW_SKIP_ACPX_RUNTIME=1
export MANGABACLAW_SKIP_ACPX_RUNTIME_PROBE=1
export MANGABACLAW_AGENT_HARNESS_FALLBACK=none
export MANGABACLAW_CODEX_MEDIA_PATH_APP_SERVER_LOG="/tmp/mangabaclaw-codex-media-path-app-server.jsonl"

PORT="${PORT:?missing PORT}"
TOKEN="${MANGABACLAW_GATEWAY_TOKEN:?missing MANGABACLAW_GATEWAY_TOKEN}"
PLUGIN_SPEC="${MANGABACLAW_CODEX_MEDIA_PATH_PLUGIN_SPEC:?missing MANGABACLAW_CODEX_MEDIA_PATH_PLUGIN_SPEC}"
GATEWAY_LOG="/tmp/mangabaclaw-codex-media-path-gateway.log"
CLIENT_LOG="/tmp/mangabaclaw-codex-media-path-client.log"
PLUGIN_INSTALL_LOG="/tmp/mangabaclaw-codex-media-path-plugin-install.log"
PLUGIN_INSPECT_LOG="/tmp/mangabaclaw-codex-media-path-plugin-inspect.json"
gateway_pid=""

cleanup() {
  mangabaclaw_e2e_stop_process "$gateway_pid"
}
trap cleanup EXIT

dump_debug_logs() {
  local status="$1"
  echo "Codex media-path Docker E2E failed with exit code $status" >&2
  mangabaclaw_e2e_dump_logs "$PLUGIN_INSTALL_LOG" "$PLUGIN_INSPECT_LOG" "$GATEWAY_LOG" "$CLIENT_LOG" "$MANGABACLAW_CODEX_MEDIA_PATH_APP_SERVER_LOG"
}
trap 'status=$?; dump_debug_logs "$status"; exit "$status"' ERR

entry="$(mangabaclaw_e2e_resolve_entrypoint)"
mkdir -p "$MANGABACLAW_STATE_DIR" "$MANGABACLAW_TEST_WORKSPACE_DIR"
rm -f "$MANGABACLAW_CODEX_MEDIA_PATH_APP_SERVER_LOG"

mangabaclaw_e2e_enable_mangabaclaw_cli_timeout

echo "Installing Codex plugin: $PLUGIN_SPEC"
mangabaclaw plugins install "$PLUGIN_SPEC" --force >"$PLUGIN_INSTALL_LOG" 2>&1
mangabaclaw plugins inspect codex --runtime --json >"$PLUGIN_INSPECT_LOG"

node scripts/e2e/lib/codex-media-path/write-config.mjs

gateway_pid="$(mangabaclaw_e2e_start_gateway "$entry" "$PORT" "$GATEWAY_LOG")"
mangabaclaw_e2e_wait_gateway_ready "$gateway_pid" "$GATEWAY_LOG" 480 "$PORT"

PORT="$PORT" MANGABACLAW_GATEWAY_TOKEN="$TOKEN" \
  tsx scripts/e2e/lib/codex-media-path/client.mjs >"$CLIENT_LOG" 2>&1

mangabaclaw_e2e_print_log "$CLIENT_LOG"
echo "Codex media-path Docker E2E passed"
