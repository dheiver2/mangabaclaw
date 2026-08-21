#!/usr/bin/env bash
# Runs the MangabaClaw rescue-message Docker smoke against the package-installed
# functional E2E image, with only the test harness mounted from the checkout.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
IMAGE_NAME="$(docker_e2e_resolve_image "mangabaclaw-system-agent-rescue-e2e" MANGABACLAW_SYSTEM_AGENT_RESCUE_E2E_IMAGE)"
CONTAINER_NAME="mangabaclaw-system-agent-rescue-e2e-$$"
RUN_LOG="$(mktemp -t mangabaclaw-system-agent-rescue-log.XXXXXX)"

cleanup() {
  docker_e2e_docker_cmd rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$RUN_LOG"
}
trap cleanup EXIT

docker_e2e_build_or_reuse "$IMAGE_NAME" system-agent-rescue
MANGABACLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 system-agent-rescue empty)"

echo "Running in-container MangabaClaw rescue smoke..."
# Harness files are mounted read-only; the app under test comes from /app/dist.
set +e
docker_e2e_run_with_harness \
  --name "$CONTAINER_NAME" \
  -e "MANGABACLAW_TEST_STATE_SCRIPT_B64=$MANGABACLAW_TEST_STATE_SCRIPT_B64" \
  -e "MANGABACLAW_GATEWAY_TOKEN=system-agent-rescue-token" \
  "$IMAGE_NAME" \
  bash -lc "set -euo pipefail
    source scripts/lib/mangabaclaw-e2e-instance.sh
    mangabaclaw_e2e_eval_test_state_from_b64 \"\${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}\"
    tsx scripts/e2e/system-agent-rescue-docker-client.ts
  " >"$RUN_LOG" 2>&1
status=${PIPESTATUS[0]}
set -e

if [ "$status" -ne 0 ]; then
  echo "Docker MangabaClaw rescue smoke failed"
  docker_e2e_print_log "$RUN_LOG"
  exit "$status"
fi

docker_e2e_print_log "$RUN_LOG"
echo "OK"
