#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-build.sh"

IMAGE_NAME="${MANGABACLAW_SANDBOX_IMAGE:-mangabaclaw-sandbox:bookworm-slim}"

docker_build_exec -t "${IMAGE_NAME}" -f "$ROOT_DIR/scripts/docker/sandbox/Dockerfile" "$ROOT_DIR"
echo "Built ${IMAGE_NAME}"
