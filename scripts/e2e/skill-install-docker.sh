#!/usr/bin/env bash
# Installs a prepared MangabaClaw npm tarball in Docker and proves live ClawHub
# skill install works while uploaded archive installs stay disabled.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-image.sh"
source "$ROOT_DIR/scripts/lib/docker-e2e-package.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "mangabaclaw-skill-install-e2e" MANGABACLAW_SKILL_INSTALL_E2E_IMAGE)"
cleanup() {
  docker_e2e_cleanup_package_tgz "${PACKAGE_TGZ:-}"
}
trap cleanup EXIT

PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz skill-install "${MANGABACLAW_CURRENT_PACKAGE_TGZ:-}")"
MANGABACLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 skill-install empty)"

docker_e2e_package_mount_args "$PACKAGE_TGZ"
docker_e2e_build_or_reuse "$IMAGE_NAME" skill-install "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "bare"

echo "Running live ClawHub skill install Docker E2E..."
run_logged_print \
  skill-install-run \
  docker_e2e_run_with_harness \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e "MANGABACLAW_TEST_STATE_SCRIPT_B64=$MANGABACLAW_TEST_STATE_SCRIPT_B64" \
  -e "MANGABACLAW_SKILL_INSTALL_E2E_QUERY=${MANGABACLAW_SKILL_INSTALL_E2E_QUERY:-homeassistant}" \
  -e "MANGABACLAW_SKILL_INSTALL_E2E_SLUG=${MANGABACLAW_SKILL_INSTALL_E2E_SLUG:-}" \
  -e "MANGABACLAW_SKILL_INSTALL_E2E_PREFERRED_SLUG=${MANGABACLAW_SKILL_INSTALL_E2E_PREFERRED_SLUG:-homeassistant-skill}" \
  "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
  "$IMAGE_NAME" \
  bash scripts/e2e/lib/skills/clawhub-install-proof.sh
