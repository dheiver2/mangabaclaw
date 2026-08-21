#!/usr/bin/env bash
# Installs the packed MangabaClaw tarball over dirty old-user state. When
# MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPEC is set, installs that published
# baseline first and upgrades it to the selected candidate.
set -euo pipefail

HARNESS_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_DIR="$(cd "${MANGABACLAW_DOCKER_E2E_REPO_ROOT:-$HARNESS_ROOT_DIR}" && pwd)"
DOCKER_E2E_HARNESS_ROOT_DIR="$HARNESS_ROOT_DIR"
source "$HARNESS_ROOT_DIR/scripts/lib/docker-e2e-image.sh"
source "$HARNESS_ROOT_DIR/scripts/lib/docker-e2e-package.sh"
source "$HARNESS_ROOT_DIR/scripts/lib/mangabaclaw-e2e-instance.sh"

IMAGE_NAME="$(docker_e2e_resolve_image "mangabaclaw-upgrade-survivor-e2e" MANGABACLAW_UPGRADE_SURVIVOR_E2E_IMAGE)"
SKIP_BUILD="${MANGABACLAW_UPGRADE_SURVIVOR_E2E_SKIP_BUILD:-0}"
DOCKER_RUN_TIMEOUT="${MANGABACLAW_UPGRADE_SURVIVOR_DOCKER_RUN_TIMEOUT:-1200s}"
BASELINE_SPEC="${MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPEC:-}"
SCENARIO="${MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO:-base}"
UPDATE_RESTART_MODE="${MANGABACLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE:-manual}"
COMMAND_TIMEOUT="${MANGABACLAW_UPGRADE_SURVIVOR_COMMAND_TIMEOUT:-900s}"
START_BUDGET_SECONDS="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_START_BUDGET_SECONDS 90)"
STATUS_BUDGET_SECONDS="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_STATUS_BUDGET_SECONDS 30)"
PROBE_TIMEOUT_MS="$(mangabaclaw_e2e_read_nonnegative_int_env MANGABACLAW_UPGRADE_SURVIVOR_PROBE_TIMEOUT_MS 60000)"
PROBE_ATTEMPT_TIMEOUT_MS="$(
  mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_PROBE_ATTEMPT_TIMEOUT_MS 5000
)"
PROBE_MAX_BODY_BYTES="$(
  mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_PROBE_MAX_BODY_BYTES 1048576
)"
ROOT_MANAGED_VPS="${MANGABACLAW_UPGRADE_SURVIVOR_ROOT_MANAGED_VPS:-0}"
LIVE_OPENAI="${MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI:-0}"
LIVE_OPENAI_ENV_ARGS=()
case "$LIVE_OPENAI" in
  0)
    ;;
  1)
    if [ "${MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE:-0}" != "1" ]; then
      echo "MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI=1 requires MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE=1" >&2
      exit 2
    fi
    if [ -z "${OPENAI_API_KEY:-}" ]; then
      echo "MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI=1 requires OPENAI_API_KEY" >&2
      exit 2
    fi
    LIVE_OPENAI_TIMEOUT_SECONDS="$(
      mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_TIMEOUT_SECONDS 180
    )"
    LIVE_OPENAI_ENV_ARGS=(
      -e OPENAI_API_KEY
      -e MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI=1
      -e MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_MODEL="${MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_MODEL:-openai/gpt-5.5}"
      -e MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_TIMEOUT_SECONDS="$LIVE_OPENAI_TIMEOUT_SECONDS"
    )
    ;;
  *)
    echo "MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI must be 0 or 1; got: $LIVE_OPENAI" >&2
    exit 2
    ;;
esac

if [ "$SCENARIO" = "sqlite-volume" ] && [ "${MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE:-0}" != "1" ]; then
  echo "sqlite-volume requires MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE=1" >&2
  exit 1
fi

resolve_lane_artifact_suffix() {
  if [ -n "${MANGABACLAW_DOCKER_ALL_LANE_NAME:-}" ]; then
    printf "%s" "$MANGABACLAW_DOCKER_ALL_LANE_NAME"
    return
  fi

  if [ "$ROOT_MANAGED_VPS" = "1" ]; then
    printf "root-managed-vps-upgrade"
  elif [ "$UPDATE_RESTART_MODE" = "auto-auth" ]; then
    printf "update-restart-auth"
  elif [ "${MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE:-0}" = "1" ]; then
    printf "published-upgrade-survivor"
  else
    printf "upgrade-survivor"
  fi

  if [ -n "${BASELINE_SPEC// }" ]; then
    printf -- "-%s" "$BASELINE_SPEC"
  fi
  if [ "$SCENARIO" != "base" ]; then
    printf -- "-%s" "$SCENARIO"
  fi
}

LANE_ARTIFACT_SUFFIX="$(resolve_lane_artifact_suffix)"
LANE_ARTIFACT_SUFFIX="${LANE_ARTIFACT_SUFFIX//[^A-Za-z0-9_.-]/_}"
ARTIFACT_DIR="${MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/upgrade-survivor/$LANE_ARTIFACT_SUFFIX}"
DOCKER_RUN_USER_ARGS=()
PREPUBLISH_PLUGIN_REGISTRY_ARGS=()
AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT=""
PROBE_ENV_ARGS=(
  -e MANGABACLAW_UPGRADE_SURVIVOR_PROBE_TIMEOUT_MS="$PROBE_TIMEOUT_MS"
  -e MANGABACLAW_UPGRADE_SURVIVOR_PROBE_ATTEMPT_TIMEOUT_MS="$PROBE_ATTEMPT_TIMEOUT_MS"
  -e MANGABACLAW_UPGRADE_SURVIVOR_PROBE_MAX_BODY_BYTES="$PROBE_MAX_BODY_BYTES"
)
if [ -n "${MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_FAILING:-}" ]; then
  PROBE_ENV_ARGS+=(
    -e MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_FAILING="$MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_FAILING"
  )
fi
if [ -n "${MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_DEGRADED:-}" ]; then
  PROBE_ENV_ARGS+=(
    -e MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_DEGRADED="$MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_DEGRADED"
  )
fi
configure_prepublish_plugin_registry() {
  local registry_dir="$1"
  PREPUBLISH_PLUGIN_REGISTRY_DIR="$(
    cd "$registry_dir" && pwd
  )"
  if [ ! -f "$PREPUBLISH_PLUGIN_REGISTRY_DIR/prepublish-plugin-registry.json" ]; then
    echo "Prepublish plugin registry manifest is missing." >&2
    exit 1
  fi
  PREPUBLISH_PLUGIN_REGISTRY_ARGS=(
    -e MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR=/tmp/mangabaclaw-prepublish-plugin-registry
    -v "$PREPUBLISH_PLUGIN_REGISTRY_DIR:/tmp/mangabaclaw-prepublish-plugin-registry:ro"
  )
}
if [ -n "${MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR:-}" ]; then
  configure_prepublish_plugin_registry "$MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR"
fi
cleanup_outer() {
  docker_e2e_cleanup_package_tgz "${PACKAGE_TGZ:-}"
  if [ -n "$AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT" ]; then
    rm -rf "$AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT"
  fi
}
trap cleanup_outer EXIT

if [ "$ROOT_MANAGED_VPS" = "1" ]; then
  if [ "${MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE:-0}" != "1" ]; then
    echo "MANGABACLAW_UPGRADE_SURVIVOR_ROOT_MANAGED_VPS=1 requires MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE=1" >&2
    exit 1
  fi
  DOCKER_RUN_USER_ARGS+=(--user root -e HOME=/root -e USER=root)
fi

normalize_npm_candidate() {
  local raw="$1"
  case "$raw" in
    latest | beta)
      printf 'mangabaclaw@%s\n' "$raw"
      ;;
    mangabaclaw@*)
      printf '%s\n' "$raw"
      ;;
    *@*)
      echo "MANGABACLAW_UPGRADE_SURVIVOR_CANDIDATE must be current, latest, beta, mangabaclaw@<version>, a bare version, or a .tgz path." >&2
      return 1
      ;;
    *)
      printf 'mangabaclaw@%s\n' "$raw"
      ;;
  esac
}

if [ "${MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE:-0}" = "1" ]; then
  if [ -z "${BASELINE_SPEC// }" ]; then
    echo "MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPEC is required for published upgrade survivor" >&2
    exit 1
  fi

  mkdir -p "$ARTIFACT_DIR"
  chmod -R a+rwX "$ARTIFACT_DIR" || true

  DOCKER_E2E_PACKAGE_ARGS=()
  CANDIDATE_RAW="${MANGABACLAW_UPGRADE_SURVIVOR_CANDIDATE:-current}"
  CANDIDATE_KIND="npm"
  CANDIDATE_IS_CURRENT=0
  CANDIDATE_SPEC=""

  if [ -n "${MANGABACLAW_CURRENT_PACKAGE_TGZ:-}" ]; then
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz upgrade-survivor "$MANGABACLAW_CURRENT_PACKAGE_TGZ")"
    docker_e2e_package_mount_args "$PACKAGE_TGZ"
    CANDIDATE_KIND="tarball"
    CANDIDATE_IS_CURRENT=1
    CANDIDATE_SPEC="/tmp/mangabaclaw-current.tgz"
  elif [ "$CANDIDATE_RAW" = "current" ]; then
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz upgrade-survivor)"
    docker_e2e_package_mount_args "$PACKAGE_TGZ"
    CANDIDATE_KIND="tarball"
    CANDIDATE_IS_CURRENT=1
    CANDIDATE_SPEC="/tmp/mangabaclaw-current.tgz"
  elif [[ "$CANDIDATE_RAW" == *.tgz ]]; then
    if [ ! -f "$CANDIDATE_RAW" ]; then
      echo "MangabaClaw candidate tarball does not exist: $CANDIDATE_RAW" >&2
      exit 1
    fi
    PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz upgrade-survivor "$CANDIDATE_RAW")"
    docker_e2e_package_mount_args "$PACKAGE_TGZ"
    CANDIDATE_KIND="tarball"
    CANDIDATE_SPEC="/tmp/mangabaclaw-current.tgz"
  else
    CANDIDATE_KIND="npm"
    CANDIDATE_SPEC="$(normalize_npm_candidate "$CANDIDATE_RAW")"
  fi

  if [ "$CANDIDATE_IS_CURRENT" = "1" ] && [ -z "${MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR:-}" ]; then
    AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT="$(
      mktemp -d "${TMPDIR:-/tmp}/mangabaclaw-upgrade-survivor-plugin-registry.XXXXXX"
    )"
    MANGABACLAW_DOCKER_ALL_LANES=published-upgrade-survivor \
      MANGABACLAW_DOCKER_ALL_LOG_DIR="$AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT" \
      MANGABACLAW_DOCKER_ALL_TIMINGS=0 \
      MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPECS="$BASELINE_SPEC" \
      MANGABACLAW_UPGRADE_SURVIVOR_SCENARIOS="$SCENARIO" \
      node "$HARNESS_ROOT_DIR/scripts/test-docker-all.mjs" --prepare-plugin-registry
    configure_prepublish_plugin_registry \
      "$AUTO_PREPUBLISH_PLUGIN_REGISTRY_ROOT/prepublish-plugin-registry"
  fi

  MANGABACLAW_TEST_STATE_FUNCTION_B64="$(docker_e2e_test_state_function_b64)"
  TRUSTED_TSX_NODE_MODULES="$HARNESS_ROOT_DIR/node_modules"
  TRUSTED_TSX_IMPORT="$TRUSTED_TSX_NODE_MODULES/tsx/dist/loader.mjs"
  if [ ! -f "$TRUSTED_TSX_IMPORT" ]; then
    echo "Trusted upgrade-survivor tsx loader not found: $TRUSTED_TSX_IMPORT" >&2
    exit 1
  fi

  docker_e2e_build_or_reuse "$IMAGE_NAME" upgrade-survivor "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "bare" "$SKIP_BUILD"

  echo "Running published upgrade survivor Docker E2E..."
  # Keep candidate images from selecting an older copy of the trusted release runner.
  docker_e2e_run_with_harness \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -e MANGABACLAW_TEST_STATE_FUNCTION_B64="$MANGABACLAW_TEST_STATE_FUNCTION_B64" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_BASELINE="$BASELINE_SPEC" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_CANDIDATE_KIND="$CANDIDATE_KIND" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_CANDIDATE_SPEC="$CANDIDATE_SPEC" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO="$SCENARIO" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE="$UPDATE_RESTART_MODE" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_COMMAND_TIMEOUT="$COMMAND_TIMEOUT" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_SESSIONS="${MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_SESSIONS:-}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_EVENTS_PER_SESSION="${MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_EVENTS_PER_SESSION:-}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_CRON_JOBS="${MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_CRON_JOBS:-}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_MIGRATION_BUDGET_SECONDS="${MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_MIGRATION_BUDGET_SECONDS:-120}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_IDEMPOTENCE_BUDGET_SECONDS="${MANGABACLAW_UPGRADE_SURVIVOR_VOLUME_IDEMPOTENCE_BUDGET_SECONDS:-60}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_LEGACY_RUNTIME_DEPS_SYMLINK="${MANGABACLAW_UPGRADE_SURVIVOR_LEGACY_RUNTIME_DEPS_SYMLINK:-}" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_ROOT_MANAGED_VPS="$ROOT_MANAGED_VPS" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_TSX_IMPORT=/tmp/mangabaclaw-release-harness/node_modules/tsx/dist/loader.mjs \
    -e MANGABACLAW_UPGRADE_SURVIVOR_SUMMARY_JSON=/tmp/mangabaclaw-upgrade-survivor-artifacts/summary.json \
    -e MANGABACLAW_UPGRADE_SURVIVOR_START_BUDGET_SECONDS="$START_BUDGET_SECONDS" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_STATUS_BUDGET_SECONDS="$STATUS_BUDGET_SECONDS" \
    -e MANGABACLAW_UPGRADE_SURVIVOR_CLAWHUB_FIXTURE_SERVER=/tmp/mangabaclaw-clawhub-fixture-server.cjs \
    "${PROBE_ENV_ARGS[@]}" \
    "${LIVE_OPENAI_ENV_ARGS[@]}" \
    -v "$ARTIFACT_DIR:/tmp/mangabaclaw-upgrade-survivor-artifacts" \
    -v "$TRUSTED_TSX_NODE_MODULES:/tmp/mangabaclaw-release-harness/node_modules:ro" \
    -v "$HARNESS_ROOT_DIR/scripts/e2e/lib/clawhub-fixture-server.cjs:/tmp/mangabaclaw-clawhub-fixture-server.cjs:ro" \
    -v "$HARNESS_ROOT_DIR/scripts/e2e/lib/upgrade-survivor/run.sh:/tmp/mangabaclaw-upgrade-survivor-run.sh:ro" \
    "${PREPUBLISH_PLUGIN_REGISTRY_ARGS[@]}" \
    "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
    "${DOCKER_RUN_USER_ARGS[@]}" \
    "$IMAGE_NAME" \
    timeout --kill-after=30s "$DOCKER_RUN_TIMEOUT" bash /tmp/mangabaclaw-upgrade-survivor-run.sh
  exit 0
fi

PACKAGE_TGZ="$(docker_e2e_prepare_package_tgz upgrade-survivor "${MANGABACLAW_CURRENT_PACKAGE_TGZ:-}")"
docker_e2e_package_mount_args "$PACKAGE_TGZ"
MANGABACLAW_TEST_STATE_SCRIPT_B64="$(docker_e2e_test_state_shell_b64 upgrade-survivor upgrade-survivor)"
mkdir -p "$ARTIFACT_DIR"
chmod -R a+rwX "$ARTIFACT_DIR" || true

docker_e2e_build_or_reuse "$IMAGE_NAME" upgrade-survivor "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR" "bare" "$SKIP_BUILD"

echo "Running upgrade survivor Docker E2E..."
docker_e2e_run_with_harness \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e MANGABACLAW_TEST_STATE_SCRIPT_B64="$MANGABACLAW_TEST_STATE_SCRIPT_B64" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT=/tmp/mangabaclaw-upgrade-survivor-artifacts \
  -e MANGABACLAW_UPGRADE_SURVIVOR_ROOT_MANAGED_VPS="$ROOT_MANAGED_VPS" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO="$SCENARIO" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE="$UPDATE_RESTART_MODE" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_COMMAND_TIMEOUT="$COMMAND_TIMEOUT" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_START_BUDGET_SECONDS="$START_BUDGET_SECONDS" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_STATUS_BUDGET_SECONDS="$STATUS_BUDGET_SECONDS" \
  -e MANGABACLAW_UPGRADE_SURVIVOR_CLAWHUB_FIXTURE_SERVER=/tmp/mangabaclaw-clawhub-fixture-server.cjs \
  "${PROBE_ENV_ARGS[@]}" \
  -v "$ARTIFACT_DIR:/tmp/mangabaclaw-upgrade-survivor-artifacts" \
  -v "$HARNESS_ROOT_DIR/scripts/e2e/lib/clawhub-fixture-server.cjs:/tmp/mangabaclaw-clawhub-fixture-server.cjs:ro" \
  "${PREPUBLISH_PLUGIN_REGISTRY_ARGS[@]}" \
  "${DOCKER_E2E_PACKAGE_ARGS[@]}" \
  "${DOCKER_RUN_USER_ARGS[@]}" \
  "$IMAGE_NAME" \
  timeout --kill-after=30s "$DOCKER_RUN_TIMEOUT" bash -lc 'set -euo pipefail
source scripts/lib/mangabaclaw-e2e-instance.sh

export npm_config_loglevel=error
export npm_config_fund=false
export npm_config_audit=false
export MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT="${MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT:-/tmp/mangabaclaw-upgrade-survivor-artifacts}"
export MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT="${MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT:-/tmp/mangabaclaw-upgrade-survivor-runtime}"
mkdir -p "$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT"
export TMPDIR="${MANGABACLAW_UPGRADE_SURVIVOR_TMPDIR:-$MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT/tmp}"
export MANGABACLAW_TEST_STATE_TMPDIR="${MANGABACLAW_UPGRADE_SURVIVOR_TEST_STATE_TMPDIR:-$MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT/state-tmp}"
export npm_config_prefix="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/npm-prefix"
export NPM_CONFIG_PREFIX="$npm_config_prefix"
export npm_config_cache="${MANGABACLAW_UPGRADE_SURVIVOR_NPM_CACHE:-$MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT/npm-cache}"
export NPM_CONFIG_CACHE="$npm_config_cache"
export npm_config_tmp="$TMPDIR"
mkdir -p "$MANGABACLAW_UPGRADE_SURVIVOR_RUNTIME_ROOT" "$TMPDIR" "$MANGABACLAW_TEST_STATE_TMPDIR" "$npm_config_prefix" "$npm_config_cache"
chmod 700 "$npm_config_cache" || true
export PATH="$npm_config_prefix/bin:$PATH"
export CI=true
export MANGABACLAW_NO_ONBOARD=1
export MANGABACLAW_NO_PROMPT=1
export MANGABACLAW_SKIP_PROVIDERS=1
export MANGABACLAW_SKIP_CHANNELS=1
export MANGABACLAW_DISABLE_BONJOUR=1
export GATEWAY_AUTH_TOKEN_REF="upgrade-survivor-token"
export OPENAI_API_KEY="sk-mangabaclaw-upgrade-survivor"
export DISCORD_BOT_TOKEN="upgrade-survivor-discord-token"
export TELEGRAM_BOT_TOKEN="123456:upgrade-survivor-telegram-token"
if [ "${MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO:-base}" = "feishu-channel" ]; then
  export FEISHU_APP_SECRET="upgrade-survivor-feishu-secret"
fi
export BRAVE_API_KEY="BSA_upgrade_survivor_brave_key"

UPDATE_RESTART_MODE="${MANGABACLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE:-manual}"
command_timeout="${MANGABACLAW_UPGRADE_SURVIVOR_COMMAND_TIMEOUT:-900s}"
PORT=18789
START_BUDGET="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_START_BUDGET_SECONDS 90)"
STATUS_BUDGET="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_UPGRADE_SURVIVOR_STATUS_BUDGET_SECONDS 30)"
GATEWAY_LOG="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/gateway.log"
SYSTEMCTL_SHIM_LOG="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/systemctl-shim.log"
SYSTEMCTL_SHIM_PID_FILE="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/systemctl-shim.pid"
SYSTEMCTL_SHIM_DAEMON_LOG="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/systemctl-shim-gateway.log"
BASELINE_SERVICE_INSTALL_JSON="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/baseline-service-install.json"
BASELINE_SERVICE_INSTALL_ERR="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/baseline-service-install.err"
export MANGABACLAW_UPGRADE_SURVIVOR_SYSTEMCTL_SHIM_LOG="$SYSTEMCTL_SHIM_LOG"
export MANGABACLAW_UPGRADE_SURVIVOR_SYSTEMCTL_SHIM_PID_FILE="$SYSTEMCTL_SHIM_PID_FILE"
export MANGABACLAW_UPGRADE_SURVIVOR_SYSTEMCTL_SHIM_DAEMON_LOG="$SYSTEMCTL_SHIM_DAEMON_LOG"
export MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SERVICE_INSTALL_JSON="$BASELINE_SERVICE_INSTALL_JSON"
export MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SERVICE_INSTALL_ERR="$BASELINE_SERVICE_INSTALL_ERR"

gateway_pid=""
plugin_registry_pid=""
clawhub_fixture_pid=""
cleanup() {
  if [ -s "$SYSTEMCTL_SHIM_PID_FILE" ]; then
    systemctl --user stop mangabaclaw-gateway.service >/dev/null 2>&1 || true
  fi
  mangabaclaw_e2e_terminate_gateways "${gateway_pid:-}"
  if [ -s "$SYSTEMCTL_SHIM_PID_FILE" ]; then
    mangabaclaw_e2e_terminate_gateways "$(cat "$SYSTEMCTL_SHIM_PID_FILE" 2>/dev/null || true)"
  fi
  mangabaclaw_e2e_stop_process "${plugin_registry_pid:-}"
  mangabaclaw_e2e_stop_process "${clawhub_fixture_pid:-}"
}
trap cleanup EXIT

wait_for_fixture_port() {
  local pid="$1" port_file="$2" log_file="$3" label="$4"
  for _ in $(seq 1 100); do
    [ -s "$port_file" ] && return 0
    mangabaclaw_e2e_process_alive "$pid" || break
    sleep 0.1
  done
  mangabaclaw_e2e_print_log "$log_file" >&2
  echo "Timed out waiting for upgrade survivor $label." >&2
  return 1
}

configure_clawhub_fixture() {
  unset MANGABACLAW_CLAWHUB_URL CLAWHUB_URL
  [ -z "${MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR:-}" ] && return 0
  local fixture_root="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/clawhub-fixture" port_file log_file
  port_file="$fixture_root/port"
  log_file="$fixture_root/server.log"
  mkdir -p "$fixture_root"
  node "$MANGABACLAW_UPGRADE_SURVIVOR_CLAWHUB_FIXTURE_SERVER" \
    prepublish-artifacts "$port_file" \
    "$MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR/prepublish-plugin-registry.json" >"$log_file" 2>&1 &
  clawhub_fixture_pid="$!"
  wait_for_fixture_port "$clawhub_fixture_pid" "$port_file" "$log_file" "ClawHub fixture"
  export MANGABACLAW_CLAWHUB_URL="http://127.0.0.1:$(cat "$port_file")"
}

configure_plugin_registry() {
  local fixture_root="$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/plugin-registry"
  local package_dir="$fixture_root/package"
  local tarball="$fixture_root/mangabaclaw-brave-plugin-2026.5.2.tgz"
  local port_file="$fixture_root/npm-registry-port"
  local log_file="$fixture_root/npm-registry.log"
  local registry_args=()

  if [ -n "${MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR:-}" ]; then
    local manifest="$MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR/prepublish-plugin-registry.json"
    local registry_rows
    registry_rows="$(
      PREPUBLISH_PLUGIN_REGISTRY_MANIFEST="$manifest" node <<'"'"'NODE'"'"'
const fs = require("node:fs");
const path = require("node:path");
const manifestPath = process.env.PREPUBLISH_PLUGIN_REGISTRY_MANIFEST;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
  throw new Error("prepublish plugin registry manifest must contain packages");
}
for (const entry of manifest.packages) {
  if (
    typeof entry.name !== "string" ||
    typeof entry.version !== "string" ||
    typeof entry.tarball !== "string" ||
    path.basename(entry.tarball) !== entry.tarball
  ) {
    throw new Error("invalid prepublish plugin registry package entry");
  }
  process.stdout.write(
    `${entry.name}\t${entry.version}\t${path.join(path.dirname(manifestPath), entry.tarball)}\n`,
  );
}
NODE
    )"
    while IFS=$'"'"'\t'"'"' read -r plugin_package_name plugin_package_version plugin_package_tarball; do
      registry_args+=("$plugin_package_name" "$plugin_package_version" "$plugin_package_tarball")
    done <<<"$registry_rows"
  fi

  if [ "${MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO:-base}" = "configured-plugin-installs" ]; then
    mkdir -p "$package_dir"
    FIXTURE_PACKAGE_DIR="$package_dir" node <<'"'"'NODE'"'"'
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.FIXTURE_PACKAGE_DIR;
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, "package.json"),
  `${JSON.stringify(
    {
      name: "@mangabaclaw/brave-plugin",
      version: "2026.5.2",
      mangabaclaw: { extensions: ["./index.js"] },
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  path.join(root, "mangabaclaw.plugin.json"),
  `${JSON.stringify(
    {
      id: "brave",
      activation: { onStartup: false },
      setup: { providers: [{ id: "brave", envVars: ["BRAVE_API_KEY"] }] },
      contracts: { webSearchProviders: ["brave"] },
      configSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          webSearch: {
            type: "object",
            additionalProperties: false,
            properties: {
              apiKey: { type: ["string", "object"] },
              mode: { type: "string", enum: ["web", "llm-context"] },
              baseUrl: { type: ["string", "object"] },
            },
          },
        },
      },
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  path.join(root, "index.js"),
  `module.exports = { id: "brave", name: "Brave Fixture", register() {} };\n`,
);
NODE
    tar -czf "$tarball" -C "$fixture_root" package
    registry_args+=("@mangabaclaw/brave-plugin" "2026.5.2" "$tarball")
  fi

  if [ "${#registry_args[@]}" -eq 0 ]; then
    return 0
  fi

  mkdir -p "$fixture_root"
  MANGABACLAW_NPM_REGISTRY_DIST_TAGS="beta=$package_version" \
  MANGABACLAW_NPM_REGISTRY_UPSTREAM=https://registry.npmjs.org \
    node scripts/e2e/lib/plugins/npm-registry-server.mjs \
    "$port_file" \
    "${registry_args[@]}" \
    >"$log_file" 2>&1 &
  plugin_registry_pid="$!"

  wait_for_fixture_port "$plugin_registry_pid" "$port_file" "$log_file" "npm registry"
  export NPM_CONFIG_REGISTRY="http://127.0.0.1:$(cat "$port_file")"
  export npm_config_registry="$NPM_CONFIG_REGISTRY"
}

mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}"
node scripts/e2e/lib/upgrade-survivor/assertions.mjs seed

mangabaclaw_e2e_install_package "$MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_ROOT/install.log" "upgrade survivor package" "$npm_config_prefix"
command -v mangabaclaw >/dev/null
package_version="$(node -p "JSON.parse(require(\"node:fs\").readFileSync(process.argv[1] + \"/lib/node_modules/mangabaclaw/package.json\", \"utf8\")).version" "$npm_config_prefix")"
MANGABACLAW_PACKAGE_ACCEPTANCE_LEGACY_COMPAT="$(
  node scripts/e2e/lib/package-compat.mjs "$package_version"
)"
export MANGABACLAW_PACKAGE_ACCEPTANCE_LEGACY_COMPAT

echo "Checking dirty-state config before update..."
MANGABACLAW_UPGRADE_SURVIVOR_ASSERT_STAGE=baseline node scripts/e2e/lib/upgrade-survivor/assertions.mjs assert-config
MANGABACLAW_UPGRADE_SURVIVOR_ASSERT_STAGE=baseline node scripts/e2e/lib/upgrade-survivor/assertions.mjs assert-state
configure_clawhub_fixture
if [ "$UPDATE_RESTART_MODE" = "auto-auth" ]; then
  # shellcheck disable=SC1091
  source scripts/e2e/lib/upgrade-survivor/update-restart-auth.sh
  prepare_update_restart_probe_current_install "$PORT" "$GATEWAY_LOG"
fi

configure_plugin_registry
echo "Running package update against the mounted tarball..."
update_args=(update --tag "${MANGABACLAW_CURRENT_PACKAGE_TGZ:?missing MANGABACLAW_CURRENT_PACKAGE_TGZ}" --yes --json)
if [ "$UPDATE_RESTART_MODE" != "auto-auth" ]; then
  update_args+=(--no-restart)
fi
set +e
mangabaclaw_e2e_maybe_timeout "$command_timeout" env -u MANGABACLAW_GATEWAY_TOKEN -u MANGABACLAW_GATEWAY_PASSWORD MANGABACLAW_ALLOW_ROOT=1 mangabaclaw "${update_args[@]}" >/tmp/mangabaclaw-upgrade-survivor-update.json 2>/tmp/mangabaclaw-upgrade-survivor-update.err
update_status=$?
set -e
if [ "$update_status" -ne 0 ]; then
  echo "mangabaclaw update failed" >&2
  validate_status=0
  mangabaclaw_e2e_maybe_timeout "$command_timeout" mangabaclaw config validate --json >/tmp/mangabaclaw-upgrade-survivor-post-update-validate.json 2>/tmp/mangabaclaw-upgrade-survivor-post-update-validate.err || validate_status=$?
  echo "post-update config validation probe status=$validate_status" >&2
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-post-update-validate.err >&2 || true
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-post-update-validate.json >&2 || true
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-update.err >&2 || true
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-update.json >&2 || true
  exit "$update_status"
fi
if [ -n "${MANGABACLAW_CLAWHUB_URL:-}" ]; then
  node "$MANGABACLAW_UPGRADE_SURVIVOR_CLAWHUB_FIXTURE_SERVER" \
    assert-prepublish-requests "$MANGABACLAW_CLAWHUB_URL" "@mangabaclaw/whatsapp" "$package_version"
fi

if [ "$UPDATE_RESTART_MODE" = "auto-auth" ]; then
  echo "Skipping doctor repair until after restart proof."
else
  echo "Running non-interactive doctor repair..."
  if ! mangabaclaw_e2e_maybe_timeout "$command_timeout" mangabaclaw doctor --fix --non-interactive >/tmp/mangabaclaw-upgrade-survivor-doctor.log 2>&1; then
    echo "mangabaclaw doctor failed" >&2
    mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-doctor.log >&2
    exit 1
  fi
  if ! mangabaclaw_e2e_maybe_timeout "$command_timeout" mangabaclaw config validate >>/tmp/mangabaclaw-upgrade-survivor-doctor.log 2>&1; then
    echo "post-doctor config validation failed" >&2
    mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-doctor.log >&2
    exit 1
  fi
fi

echo "Verifying config and state survived update..."
node scripts/e2e/lib/upgrade-survivor/assertions.mjs assert-config
node scripts/e2e/lib/upgrade-survivor/assertions.mjs assert-state

startup_summary="n/a"
if [ "$UPDATE_RESTART_MODE" = "auto-auth" ]; then
  echo "Gateway restart was handled by mangabaclaw update."
else
  echo "Starting gateway from upgraded state..."
  start_epoch="$(node -e "process.stdout.write(String(Date.now()))")"
  mangabaclaw gateway --port "$PORT" --bind loopback --allow-unconfigured >"$GATEWAY_LOG" 2>&1 &
  gateway_pid="$!"
  mangabaclaw_e2e_wait_gateway_ready "$gateway_pid" "$GATEWAY_LOG" 360 "$PORT"
  ready_epoch="$(node -e "process.stdout.write(String(Date.now()))")"
  start_seconds=$(((ready_epoch - start_epoch + 999) / 1000))
  if [ "$start_seconds" -gt "$START_BUDGET" ]; then
    echo "gateway startup exceeded survivor budget: ${start_seconds}s > ${START_BUDGET}s" >&2
    mangabaclaw_e2e_print_log "$GATEWAY_LOG" >&2
    exit 1
  fi
  startup_summary="${start_seconds}s"
fi

echo "Checking gateway HTTP probes..."
node scripts/e2e/lib/upgrade-survivor/probe-gateway.mjs \
  --base-url "http://127.0.0.1:$PORT" \
  --path /healthz \
  --expect live \
  --out /tmp/mangabaclaw-upgrade-survivor-healthz.json

readyz_probe_args=(
  --base-url "http://127.0.0.1:$PORT"
  --path /readyz
  --expect ready
)
if [ -n "${MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_FAILING:-}" ]; then
  readyz_probe_args+=(--allow-failing "$MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_FAILING")
fi
if [ "${MANGABACLAW_UPGRADE_SURVIVOR_READYZ_ALLOW_DEGRADED:-}" = "1" ]; then
  readyz_probe_args+=(--allow-degraded-ready)
fi
readyz_probe_args+=(--out /tmp/mangabaclaw-upgrade-survivor-readyz.json)
node scripts/e2e/lib/upgrade-survivor/probe-gateway.mjs "${readyz_probe_args[@]}"

echo "Checking gateway RPC status..."
status_start="$(node -e "process.stdout.write(String(Date.now()))")"
if ! mangabaclaw_e2e_maybe_timeout "$command_timeout" mangabaclaw gateway status --url "ws://127.0.0.1:$PORT" --token "$GATEWAY_AUTH_TOKEN_REF" --require-rpc --timeout 30000 --json >/tmp/mangabaclaw-upgrade-survivor-status.json 2>/tmp/mangabaclaw-upgrade-survivor-status.err; then
  echo "gateway status failed" >&2
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-status.err >&2
  mangabaclaw_e2e_print_log "$GATEWAY_LOG" >&2
  mangabaclaw_e2e_print_log "$SYSTEMCTL_SHIM_DAEMON_LOG" >&2
  exit 1
fi
status_end="$(node -e "process.stdout.write(String(Date.now()))")"
status_seconds=$(((status_end - status_start + 999) / 1000))
if [ "$status_seconds" -gt "$STATUS_BUDGET" ]; then
  echo "gateway status exceeded survivor budget: ${status_seconds}s > ${STATUS_BUDGET}s" >&2
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-upgrade-survivor-status.json >&2
  exit 1
fi
node scripts/e2e/lib/upgrade-survivor/assertions.mjs assert-status-json /tmp/mangabaclaw-upgrade-survivor-status.json

echo "Upgrade survivor Docker E2E passed scenario=${MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO:-base} updateRestartMode=${UPDATE_RESTART_MODE} startup=${startup_summary} status=${status_seconds}s."
'
