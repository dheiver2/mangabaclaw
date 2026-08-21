#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-build.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-container.sh"

IMAGE_NAME="${MANGABACLAW_DOCKER_SELECTED_PLUGINS_E2E_IMAGE:-mangabaclaw-docker-selected-plugins-e2e:local}"
DEPENDENCY_ONLY_IMAGE="${IMAGE_NAME}-dependency-only"
CONTAINER_NAME="mangabaclaw-docker-selected-plugins-e2e-$$"
SELECTED_PLUGINS="${MANGABACLAW_DOCKER_SELECTED_PLUGINS:-slack,msteams clickclack,slack}"
BUILD_GIT_COMMIT="${MANGABACLAW_DOCKER_SELECTED_PLUGINS_E2E_GIT_COMMIT:-0123456789abcdef0123456789abcdef01234567}"
BUILD_TIMESTAMP="${MANGABACLAW_DOCKER_SELECTED_PLUGINS_E2E_BUILD_TIMESTAMP:-2026-07-10T12:34:56.000Z}"
UNKNOWN_LOG="$(mktemp -t mangabaclaw-docker-selected-plugins-unknown.XXXXXX)"
RUN_LOG="$(mktemp -t mangabaclaw-docker-selected-plugins-run.XXXXXX)"
DOCKER_COMMAND_TIMEOUT="${MANGABACLAW_DOCKER_SELECTED_PLUGINS_RUN_TIMEOUT:-900s}"
DEPENDENCY_ONLY_IMAGE_BUILT=0

cleanup() {
  docker_e2e_docker_cmd rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  if [ "$DEPENDENCY_ONLY_IMAGE_BUILT" = "1" ]; then
    docker_e2e_docker_cmd image rm -f "$DEPENDENCY_ONLY_IMAGE" >/dev/null 2>&1 || true
  fi
  rm -f "$UNKNOWN_LOG" "$RUN_LOG"
}
trap cleanup EXIT

if [ "${MANGABACLAW_SKIP_DOCKER_BUILD:-0}" = "1" ]; then
  echo "Reusing selected-plugin image: $IMAGE_NAME"
  docker_e2e_docker_cmd image inspect "$IMAGE_NAME" >/dev/null
else
  echo "Proving unknown selected plugins fail closed..."
  set +e
  docker_e2e_timeout_cmd "${MANGABACLAW_DOCKER_SELECTED_PLUGINS_BUILD_TIMEOUT:-3600s}" \
    env DOCKER_BUILDKIT=1 docker build \
    --target workspace-deps \
    --build-arg MANGABACLAW_EXTENSIONS=missing-plugin \
    -f "$ROOT_DIR/Dockerfile" \
    "$ROOT_DIR" >"$UNKNOWN_LOG" 2>&1
  unknown_status=$?
  set -e
  if [ "$unknown_status" -eq 0 ] || ! grep -Fq \
    "unknown MANGABACLAW_EXTENSIONS plugin id: missing-plugin" "$UNKNOWN_LOG"; then
    echo "Unknown selected-plugin build did not fail closed as expected" >&2
    docker_e2e_print_log "$UNKNOWN_LOG"
    exit 1
  fi

  echo "Proving manifest ids and known dependency-only plugins remain stageable..."
  docker_build_run docker-selected-plugins-dependency-only \
    --target workspace-deps \
    --build-arg MANGABACLAW_EXTENSIONS=whatsapp,kimi \
    -t "$DEPENDENCY_ONLY_IMAGE" \
    -f "$ROOT_DIR/Dockerfile" \
    "$ROOT_DIR"
  DEPENDENCY_ONLY_IMAGE_BUILT=1
  docker_e2e_docker_run_cmd run --rm \
    --entrypoint sh \
    "$DEPENDENCY_ONLY_IMAGE" \
    -c 'test -f /out/extensions/whatsapp/package.json && test -f /out/extensions/kimi-coding/package.json && grep -qx kimi-coding /out/mangabaclaw-selected-plugin-dirs'

  echo "Building selected-plugin runtime image: $IMAGE_NAME"
  docker_build_run docker-selected-plugins-build \
    --build-arg "GIT_COMMIT=$BUILD_GIT_COMMIT" \
    --build-arg "MANGABACLAW_BUILD_TIMESTAMP=$BUILD_TIMESTAMP" \
    --build-arg "MANGABACLAW_EXTENSIONS=$SELECTED_PLUGINS" \
    -t "$IMAGE_NAME" \
    -f "$ROOT_DIR/Dockerfile" \
    "$ROOT_DIR"
fi

echo "Inspecting selected plugins from the final runtime image..."
if ! docker_e2e_docker_run_cmd run --rm \
  --name "$CONTAINER_NAME" \
  --entrypoint bash \
  -e "MANGABACLAW_E2E_EXPECTED_GIT_COMMIT=$BUILD_GIT_COMMIT" \
  -e "MANGABACLAW_E2E_EXPECTED_BUILD_TIMESTAMP=$BUILD_TIMESTAMP" \
  -v "$ROOT_DIR/scripts/e2e/lib/docker-selected-plugins:/mangabaclaw-e2e:ro" \
  "$IMAGE_NAME" \
  /mangabaclaw-e2e/scenario.sh >"$RUN_LOG" 2>&1; then
  echo "Selected-plugin Docker E2E failed" >&2
  docker_e2e_print_log "$RUN_LOG"
  exit 1
fi

docker_e2e_print_log "$RUN_LOG"
echo "Selected-plugin Docker E2E passed"
