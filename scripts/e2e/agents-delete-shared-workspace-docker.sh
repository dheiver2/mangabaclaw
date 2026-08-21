#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "mangabaclaw-agents-delete-shared-workspace-e2e:local" MANGABACLAW_AGENTS_DELETE_SHARED_WORKSPACE_E2E_IMAGE)"
SKIP_BUILD="${MANGABACLAW_AGENTS_DELETE_SHARED_WORKSPACE_E2E_SKIP_BUILD:-0}"
DOCKER_COMMAND_TIMEOUT="${MANGABACLAW_AGENTS_DELETE_SHARED_WORKSPACE_DOCKER_COMMAND_TIMEOUT:-300s}"
MANGABACLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 agents-delete-shared-workspace empty)"

docker_e2e_build_or_reuse "$IMAGE_NAME" agents-delete-shared-workspace "$ROOT_DIR/Dockerfile" "$ROOT_DIR" "" "$SKIP_BUILD"
docker_e2e_harness_mount_args

run_logged agents-delete-shared-workspace docker_e2e_docker_cmd run --rm \
  "${DOCKER_E2E_HARNESS_ARGS[@]}" \
  --entrypoint bash \
  -e MANGABACLAW_SKIP_CHANNELS=1 \
  -e MANGABACLAW_SKIP_PROVIDERS=1 \
  -e MANGABACLAW_SKIP_GMAIL_WATCHER=1 \
  -e MANGABACLAW_SKIP_CRON=1 \
  -e MANGABACLAW_SKIP_CANVAS_HOST=1 \
  -e MANGABACLAW_SKIP_BROWSER_CONTROL_SERVER=1 \
  -e MANGABACLAW_SKIP_ACPX_RUNTIME=1 \
  -e MANGABACLAW_SKIP_ACPX_RUNTIME_PROBE=1 \
  -e MANGABACLAW_GATEWAY_TOKEN=agents-delete-shared-workspace-token \
  -e "MANGABACLAW_TEST_STATE_SCRIPT_B64=$MANGABACLAW_TEST_STATE_SCRIPT_B64" \
  "$IMAGE_NAME" \
  -lc '
set -euo pipefail
source scripts/lib/mangabaclaw-e2e-instance.sh

mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}"
export SHARED_WORKSPACE="$HOME/workspace-shared"
output_file="$HOME/delete.json"
gateway_log="$HOME/gateway.log"
gateway_pid=""

cleanup() {
  mangabaclaw_e2e_terminate_gateways "${gateway_pid:-}"
  rm -rf "$HOME"
}
dump_logs_on_error() {
  local status=$?
  mangabaclaw_e2e_print_log "$gateway_log" >&2
  exit "$status"
}
trap cleanup EXIT
trap dump_logs_on_error ERR

mkdir -p "$MANGABACLAW_STATE_DIR" "$SHARED_WORKSPACE"
node scripts/e2e/lib/fixture.mjs agents-delete-config

entry="$(mangabaclaw_e2e_resolve_entrypoint)"
gateway_pid="$(mangabaclaw_e2e_start_gateway "$entry" 18789 "$gateway_log")"
mangabaclaw_e2e_wait_gateway_ready "$gateway_pid" "$gateway_log" 300 18789

node "$entry" agents delete ops --force --json > "$output_file"

node scripts/e2e/lib/fixture.mjs agents-delete-assert "$output_file"
'
