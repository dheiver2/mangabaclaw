#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-build.sh"
source "$ROOT_DIR/scripts/lib/build-metadata.sh"
source "$ROOT_DIR/scripts/lib/host-timeout.sh"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
EXTRA_COMPOSE_FILE="$ROOT_DIR/docker-compose.extra.yml"
IMAGE_NAME="${MANGABACLAW_IMAGE:-mangabaclaw:local}"
EXTRA_MOUNTS="${MANGABACLAW_EXTRA_MOUNTS:-}"
HOME_VOLUME_NAME="${MANGABACLAW_HOME_VOLUME:-}"
RAW_SANDBOX_SETTING="${MANGABACLAW_SANDBOX:-}"
SANDBOX_ENABLED=""
DOCKER_SOCKET_PATH="${MANGABACLAW_DOCKER_SOCKET:-}"
TIMEZONE="${MANGABACLAW_TZ:-}"
RAW_SKIP_ONBOARDING="${MANGABACLAW_SKIP_ONBOARDING:-}"
SKIP_ONBOARDING=""
DOCKER_PULL_TIMEOUT="${MANGABACLAW_DOCKER_SETUP_PULL_TIMEOUT:-600s}"
OFFLINE_MODE=""
DEFAULT_SANDBOX_IMAGE="mangabaclaw-sandbox:bookworm-slim"
DEFAULT_SANDBOX_BROWSER_IMAGE="mangabaclaw-sandbox-browser:bookworm-slim"
SANDBOX_BROWSER_IMAGE_CONTRACT_EPOCH="2026-05-12-cdp-relay-auth"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --offline)
      OFFLINE_MODE="1"
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

run_docker_build() {
  # Dockerfile uses BuildKit-only syntax (RUN --mount=type=cache). Force
  # BuildKit so hosts defaulting to the legacy builder do not fail.
  docker_build_exec "$@"
}

run_docker_pull() {
  local image="$1"
  mangabaclaw_host_timeout_cmd "$DOCKER_PULL_TIMEOUT" docker pull "$image"
}

require_local_docker_image() {
  local image="$1"
  if docker image inspect "$image" >/dev/null 2>&1; then
    return 0
  fi
  fail "Offline Docker setup requires preloaded image $image. Load it with 'docker load -i <image.tar>' before running scripts/docker/setup.sh --offline."
}

is_truthy_value() {
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

read_config_gateway_token() {
  local config_path="$MANGABACLAW_CONFIG_DIR/mangabaclaw.json"
  if [[ ! -f "$config_path" ]]; then
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$config_path" <<'PY'
import json
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
except Exception:
    raise SystemExit(0)

gateway = cfg.get("gateway")
if not isinstance(gateway, dict):
    raise SystemExit(0)
auth = gateway.get("auth")
if not isinstance(auth, dict):
    raise SystemExit(0)
token = auth.get("token")
if isinstance(token, str):
    token = token.strip()
    if token:
        print(token)
PY
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node - "$config_path" <<'NODE'
const fs = require("node:fs");
const configPath = process.argv[2];
try {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = cfg?.gateway?.auth?.token;
  if (typeof token === "string" && token.trim().length > 0) {
    process.stdout.write(token.trim());
  }
} catch {
  // Keep docker-setup resilient when config parsing fails.
}
NODE
  fi
}

read_env_gateway_token() {
  local env_path="$1"
  local line=""
  local token=""
  if [[ ! -f "$env_path" ]]; then
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" == MANGABACLAW_GATEWAY_TOKEN=* ]]; then
      token="${line#MANGABACLAW_GATEWAY_TOKEN=}"
    fi
  done <"$env_path"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
  fi
}

sync_gateway_config() {
  local allowed_origin_json=""
  local current_allowed_origins=""
  local batch_json=""

  if [[ "${MANGABACLAW_GATEWAY_BIND}" != "loopback" ]]; then
    allowed_origin_json="$(printf '["http://localhost:%s","http://127.0.0.1:%s"]' "$MANGABACLAW_GATEWAY_PORT" "$MANGABACLAW_GATEWAY_PORT")"
    current_allowed_origins="$(
      run_prestart_cli config get gateway.controlUi.allowedOrigins 2>/dev/null || true
    )"
    current_allowed_origins="${current_allowed_origins//$'\r'/}"
  fi

  batch_json="$(printf '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"%s"}' "$MANGABACLAW_GATEWAY_BIND")"
  if [[ -n "$allowed_origin_json" ]]; then
    if [[ -n "$current_allowed_origins" && "$current_allowed_origins" != "null" && "$current_allowed_origins" != "[]" ]]; then
      echo "Control UI allowlist already configured; leaving gateway.controlUi.allowedOrigins unchanged."
    else
      batch_json+=",{\"path\":\"gateway.controlUi.allowedOrigins\",\"value\":$allowed_origin_json}"
    fi
  fi
  batch_json+="]"

  run_prestart_cli config set --batch-json "$batch_json" >/dev/null
  echo "Pinned gateway.mode=local and gateway.bind=$MANGABACLAW_GATEWAY_BIND for Docker setup."
  if [[ -n "$allowed_origin_json" ]]; then
    if [[ -z "$current_allowed_origins" || "$current_allowed_origins" == "null" || "$current_allowed_origins" == "[]" ]]; then
      echo "Set gateway.controlUi.allowedOrigins to $allowed_origin_json for non-loopback bind."
    fi
  fi
}

run_compose_one_off() {
  local -a run_args=(run)
  if [[ -n "$OFFLINE_MODE" ]]; then
    run_args+=(--pull never)
  fi
  docker compose "${COMPOSE_ARGS[@]}" "${run_args[@]}" "$@"
}

run_prestart_gateway() {
  run_compose_one_off --rm --no-deps "$@"
}

run_prestart_cli() {
  # During setup, avoid the shared-network mangabaclaw-cli service because it
  # requires the gateway container's network namespace to already exist. That
  # creates a circular dependency for config writes that are needed before the
  # gateway can start cleanly.
  # Host MANGABACLAW_* paths are Compose bind-mount sources. Setup-time CLI writes
  # must still resolve state/config paths inside the container.
  run_prestart_gateway \
    -e HOME=/home/node \
    -e MANGABACLAW_HOME=/home/node \
    -e MANGABACLAW_STATE_DIR=/home/node/.mangabaclaw \
    -e MANGABACLAW_CONFIG_PATH=/home/node/.mangabaclaw/mangabaclaw.json \
    -e MANGABACLAW_CONFIG_DIR=/home/node/.mangabaclaw \
    -e MANGABACLAW_WORKSPACE_DIR=/home/node/.mangabaclaw/workspace \
    --entrypoint node mangabaclaw-gateway \
    dist/index.js "$@"
}

run_runtime_cli() {
  local compose_scope="${1:-current}"
  local deps_mode="${2:-with-deps}"
  shift 2

  local -a compose_args
  local -a run_args=(run)
  if [[ -n "$OFFLINE_MODE" ]]; then
    run_args+=(--pull never)
  fi
  run_args+=(--rm)

  case "$compose_scope" in
    current) compose_args=("${COMPOSE_ARGS[@]}") ;;
    base) compose_args=("${BASE_COMPOSE_ARGS[@]}") ;;
    *) fail "Unknown runtime CLI compose scope: $compose_scope" ;;
  esac

  case "$deps_mode" in
    with-deps) ;;
    no-deps) run_args+=(--no-deps) ;;
    *) fail "Unknown runtime CLI deps mode: $deps_mode" ;;
  esac

  docker compose "${compose_args[@]}" "${run_args[@]}" mangabaclaw-cli "$@"
}

run_gateway_up() {
  local compose_scope="${1:-current}"
  shift

  local -a compose_args
  local -a up_args=(up -d)

  case "$compose_scope" in
    current) compose_args=("${COMPOSE_ARGS[@]}") ;;
    base) compose_args=("${BASE_COMPOSE_ARGS[@]}") ;;
    *) fail "Unknown gateway compose scope: $compose_scope" ;;
  esac

  if [[ -n "$OFFLINE_MODE" ]]; then
    up_args+=(--pull never --no-build)
  fi
  up_args+=("$@")

  docker compose "${compose_args[@]}" "${up_args[@]}" mangabaclaw-gateway
}

resolve_offline_sandbox_images() {
  local agents_json sandbox_tools_json
  agents_json="$(run_prestart_cli config get agents --json 2>/dev/null || true)"
  if [[ -z "$agents_json" ]]; then
    agents_json="{}"
  fi
  sandbox_tools_json="$(
    run_prestart_cli config get tools.sandbox.tools --json 2>/dev/null || true
  )"
  if [[ -z "$sandbox_tools_json" ]]; then
    sandbox_tools_json="{}"
  fi

  printf '%s' "$agents_json" | run_prestart_gateway \
    -T --entrypoint node mangabaclaw-gateway -e '
const fs = require("node:fs");
const agents = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const globalToolPolicy = JSON.parse(process.argv[3] || "{}");
const defaultSandbox = agents?.defaults?.sandbox ?? {};
const defaultDockerImage = defaultSandbox?.docker?.image ?? process.argv[1];
const defaultBrowserImage = defaultSandbox?.browser?.image ?? process.argv[2];
const images = new Set();
const configuredEntries = Array.isArray(agents?.list)
  ? agents.list.filter((entry) => entry !== null && typeof entry === "object")
  : [];
const entries = configuredEntries.length > 0 ? configuredEntries : [{ sandbox: {} }];

const matchesBrowser = (rawPattern) => {
  const pattern = String(rawPattern ?? "").trim().toLowerCase();
  if (pattern === "group:mangabaclaw" || pattern === "group:ui") {
    return true;
  }
  if (!pattern) {
    return false;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`).test("browser");
};
const permitsBrowser = (entry) => {
  const agentPolicy = entry?.tools?.sandbox?.tools ?? {};
  const allow = Array.isArray(agentPolicy.allow)
    ? agentPolicy.allow
    : Array.isArray(globalToolPolicy?.allow)
      ? globalToolPolicy.allow
      : undefined;
  const alsoAllow = Array.isArray(agentPolicy.alsoAllow)
    ? agentPolicy.alsoAllow
    : Array.isArray(globalToolPolicy?.alsoAllow)
      ? globalToolPolicy.alsoAllow
      : undefined;
  const deny = Array.isArray(agentPolicy.deny)
    ? agentPolicy.deny
    : Array.isArray(globalToolPolicy?.deny)
      ? globalToolPolicy.deny
      : undefined;

  // Browser is absent from the default allowlist and present in the default
  // denylist. Explicit allow patterns re-enable it unless an explicit deny wins.
  const explicitAllows = [...(allow ?? []), ...(alsoAllow ?? [])];
  const allowedByAllowlist = Array.isArray(allow)
    ? allow.length === 0 || explicitAllows.some(matchesBrowser)
    : (alsoAllow ?? []).some(matchesBrowser);
  const denied = Array.isArray(deny)
    ? deny.some(matchesBrowser)
    : !explicitAllows.some(matchesBrowser);
  return allowedByAllowlist && !denied;
};

for (const entry of entries) {
  const sandbox = entry?.sandbox ?? {};
  const mode = sandbox.mode ?? "non-main";
  const backend = (
    sandbox.backend?.trim() ||
    defaultSandbox.backend?.trim() ||
    "docker"
  ).toLowerCase();
  if (mode === "off" || backend !== "docker") {
    continue;
  }

  // Setup writes defaults scope=agent. Explicit per-agent scope still wins,
  // and shared scope intentionally ignores per-agent Docker/browser overrides.
  const scope = sandbox.scope ?? "agent";
  const agentDocker = scope === "shared" ? undefined : sandbox.docker;
  images.add(`sandbox\t${agentDocker?.image ?? defaultDockerImage}`);

  const agentBrowser = scope === "shared" ? undefined : sandbox.browser;
  const browserEnabled = agentBrowser?.enabled ?? defaultSandbox?.browser?.enabled ?? false;
  if (browserEnabled && permitsBrowser(entry)) {
    images.add(`browser\t${agentBrowser?.image ?? defaultBrowserImage}`);
  }
}
process.stdout.write([...images].join("\n"));
' "$DEFAULT_SANDBOX_IMAGE" "$DEFAULT_SANDBOX_BROWSER_IMAGE" "$sandbox_tools_json"
}

validate_offline_sandbox_prerequisites() {
  if [[ ! -S "$DOCKER_SOCKET_PATH" ]]; then
    fail "Offline sandbox setup requires a Docker socket at $DOCKER_SOCKET_PATH."
  fi

  local sandbox_images
  sandbox_images="$(resolve_offline_sandbox_images)"
  local -a sandbox_image_errors=()
  local image_kind sandbox_image browser_contract
  while IFS=$'\t' read -r image_kind sandbox_image; do
    [[ -n "$image_kind" ]] || continue
    case "$image_kind" in
      sandbox)
        if ! docker --host "unix://$DOCKER_SOCKET_PATH" image inspect "$sandbox_image" >/dev/null 2>&1; then
          sandbox_image_errors+=("$sandbox_image (missing)")
        fi
        ;;
      browser)
        if ! browser_contract="$(
          docker --host "unix://$DOCKER_SOCKET_PATH" image inspect \
            -f '{{ index .Config.Labels "org.mangabaclaw.sandbox-browser.contract" }}' \
            "$sandbox_image" 2>/dev/null
        )"; then
          sandbox_image_errors+=("$sandbox_image (missing)")
        elif [[ "$browser_contract" != "$SANDBOX_BROWSER_IMAGE_CONTRACT_EPOCH" ]]; then
          sandbox_image_errors+=(
            "$sandbox_image (browser contract=${browser_contract:-missing}, expected=$SANDBOX_BROWSER_IMAGE_CONTRACT_EPOCH)"
          )
        fi
        ;;
      *)
        fail "Unknown offline sandbox image kind: $image_kind"
        ;;
    esac
  done <<<"$sandbox_images"

  if [[ ${#sandbox_image_errors[@]} -gt 0 ]]; then
    echo "WARNING: offline Docker setup cannot use required sandbox images:" >&2
    local sandbox_image_error
    for sandbox_image_error in "${sandbox_image_errors[@]}"; do
      echo "  - $sandbox_image_error" >&2
    done
    echo "  Load them with 'docker load -i <sandbox-image.tar>' before enabling sandboxed agents." >&2
    fail "Offline sandbox prerequisites are incomplete; sandbox configuration was not changed."
  fi

  echo "Using preloaded sandbox images:"
  while IFS=$'\t' read -r _ sandbox_image; do
    if [[ -n "$sandbox_image" ]]; then
      echo "  - $sandbox_image"
    fi
  done <<<"$sandbox_images"

  if ! run_compose_one_off --rm --entrypoint docker mangabaclaw-gateway --version >/dev/null 2>&1; then
    fail "Offline sandbox setup requires Docker CLI in $IMAGE_NAME."
  fi
}

contains_disallowed_chars() {
  local value="$1"
  [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *$'\t'* ]]
}

is_valid_timezone_in_image() {
  local value="$1"
  docker run --rm --network none --entrypoint node "$IMAGE_NAME" -e '
const timezone = process.argv[1];
try {
  new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
} catch {
  process.exit(1);
}
' "$value"
}

validate_mount_path_value() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    fail "$label cannot be empty."
  fi
  if contains_disallowed_chars "$value"; then
    fail "$label contains unsupported control characters."
  fi
}

validate_named_volume() {
  local value="$1"
  if [[ ! "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    fail "MANGABACLAW_HOME_VOLUME must match [A-Za-z0-9][A-Za-z0-9_.-]* when using a named volume."
  fi
}

validate_mount_spec() {
  local mount="$1"
  if contains_disallowed_chars "$mount"; then
    fail "MANGABACLAW_EXTRA_MOUNTS entries cannot contain control characters."
  fi
  # Keep mount specs strict to avoid YAML structure injection.
  # Expected format: source:target[:options]
  if [[ ! "$mount" =~ ^[^,:]+:[^,:]+(:[^,:]+)?$ ]]; then
    fail "Invalid mount format '$mount'. Expected source:target[:options] without commas or control characters."
  fi
}

quote_yaml_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

if [[ -z "$DOCKER_SOCKET_PATH" && "${DOCKER_HOST:-}" == unix://* ]]; then
  DOCKER_SOCKET_PATH="${DOCKER_HOST#unix://}"
fi
if [[ -z "$DOCKER_SOCKET_PATH" ]]; then
  DOCKER_SOCKET_PATH="/var/run/docker.sock"
fi
if is_truthy_value "$RAW_SANDBOX_SETTING"; then
  SANDBOX_ENABLED="1"
fi
if is_truthy_value "$RAW_SKIP_ONBOARDING"; then
  SKIP_ONBOARDING="1"
fi

MANGABACLAW_CONFIG_DIR="${MANGABACLAW_CONFIG_DIR:-$HOME/.mangabaclaw}"
MANGABACLAW_WORKSPACE_DIR="${MANGABACLAW_WORKSPACE_DIR:-$HOME/.mangabaclaw/workspace}"
MANGABACLAW_AUTH_PROFILE_SECRET_DIR="${MANGABACLAW_AUTH_PROFILE_SECRET_DIR:-$HOME/.mangabaclaw-auth-profile-secrets}"

validate_mount_path_value "MANGABACLAW_CONFIG_DIR" "$MANGABACLAW_CONFIG_DIR"
validate_mount_path_value "MANGABACLAW_WORKSPACE_DIR" "$MANGABACLAW_WORKSPACE_DIR"
validate_mount_path_value "MANGABACLAW_AUTH_PROFILE_SECRET_DIR" "$MANGABACLAW_AUTH_PROFILE_SECRET_DIR"
if [[ -n "$HOME_VOLUME_NAME" ]]; then
  if [[ "$HOME_VOLUME_NAME" == *"/"* ]]; then
    validate_mount_path_value "MANGABACLAW_HOME_VOLUME" "$HOME_VOLUME_NAME"
  else
    validate_named_volume "$HOME_VOLUME_NAME"
  fi
fi
if contains_disallowed_chars "$EXTRA_MOUNTS"; then
  fail "MANGABACLAW_EXTRA_MOUNTS cannot contain control characters."
fi
if [[ -n "$SANDBOX_ENABLED" ]]; then
  validate_mount_path_value "MANGABACLAW_DOCKER_SOCKET" "$DOCKER_SOCKET_PATH"
fi
if [[ -n "$TIMEZONE" ]]; then
  if contains_disallowed_chars "$TIMEZONE"; then
    fail "MANGABACLAW_TZ contains unsupported control characters."
  fi
  if [[ ! "$TIMEZONE" =~ ^[A-Za-z0-9/_+\-]+$ ]]; then
    fail "MANGABACLAW_TZ must be a valid IANA timezone string (e.g. Asia/Shanghai)."
  fi
fi

mkdir -p "$MANGABACLAW_CONFIG_DIR"
mkdir -p "$MANGABACLAW_WORKSPACE_DIR"
mkdir -p "$MANGABACLAW_AUTH_PROFILE_SECRET_DIR"
# Seed directory tree eagerly so bind mounts work even on Docker Desktop/Windows
# where the container (even as root) cannot create new host subdirectories.
mkdir -p "$MANGABACLAW_CONFIG_DIR/identity"
mkdir -p "$MANGABACLAW_CONFIG_DIR/agents/main/agent"
mkdir -p "$MANGABACLAW_CONFIG_DIR/agents/main/sessions"

export MANGABACLAW_CONFIG_DIR
export MANGABACLAW_WORKSPACE_DIR
export MANGABACLAW_AUTH_PROFILE_SECRET_DIR
export MANGABACLAW_GATEWAY_PORT="${MANGABACLAW_GATEWAY_PORT:-18789}"
export MANGABACLAW_BRIDGE_PORT="${MANGABACLAW_BRIDGE_PORT:-18790}"
export MANGABACLAW_GATEWAY_BIND="${MANGABACLAW_GATEWAY_BIND:-lan}"
export MANGABACLAW_DISABLE_BONJOUR="${MANGABACLAW_DISABLE_BONJOUR:-}"
export MANGABACLAW_IMAGE="$IMAGE_NAME"
export MANGABACLAW_IMAGE_APT_PACKAGES="${MANGABACLAW_IMAGE_APT_PACKAGES-${MANGABACLAW_DOCKER_APT_PACKAGES:-}}"
export MANGABACLAW_IMAGE_PIP_PACKAGES="${MANGABACLAW_IMAGE_PIP_PACKAGES:-}"
export MANGABACLAW_EXTENSIONS="${MANGABACLAW_EXTENSIONS:-}"
export MANGABACLAW_DOCKER_BUILD_NODE_OPTIONS="${MANGABACLAW_DOCKER_BUILD_NODE_OPTIONS---max-old-space-size=8192}"
export MANGABACLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB="${MANGABACLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB:-}"
export MANGABACLAW_DOCKER_BUILD_SKIP_DTS="${MANGABACLAW_DOCKER_BUILD_SKIP_DTS:-1}"
export MANGABACLAW_INSTALL_BROWSER="${MANGABACLAW_INSTALL_BROWSER:-}"
export MANGABACLAW_EXTRA_MOUNTS="$EXTRA_MOUNTS"
export MANGABACLAW_HOME_VOLUME="$HOME_VOLUME_NAME"
export MANGABACLAW_ALLOW_INSECURE_PRIVATE_WS="${MANGABACLAW_ALLOW_INSECURE_PRIVATE_WS:-}"
export MANGABACLAW_SANDBOX="$SANDBOX_ENABLED"
export MANGABACLAW_DOCKER_SOCKET="$DOCKER_SOCKET_PATH"
export MANGABACLAW_DOCKER_SETUP=1
export MANGABACLAW_TZ="$TIMEZONE"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}"
export OTEL_EXPORTER_OTLP_PROTOCOL="${OTEL_EXPORTER_OTLP_PROTOCOL:-}"
export OTEL_EXPORTER_OTLP_TRACES_PROTOCOL="${OTEL_EXPORTER_OTLP_TRACES_PROTOCOL:-}"
export OTEL_EXPORTER_OTLP_METRICS_PROTOCOL="${OTEL_EXPORTER_OTLP_METRICS_PROTOCOL:-}"
export OTEL_EXPORTER_OTLP_LOGS_PROTOCOL="${OTEL_EXPORTER_OTLP_LOGS_PROTOCOL:-}"
export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-}"
export OTEL_SEMCONV_STABILITY_OPT_IN="${OTEL_SEMCONV_STABILITY_OPT_IN:-}"
export MANGABACLAW_OTEL_PRELOADED="${MANGABACLAW_OTEL_PRELOADED:-}"
export MANGABACLAW_SKIP_ONBOARDING="$SKIP_ONBOARDING"

# Detect Docker socket GID for sandbox group_add.
DOCKER_GID=""
if [[ -n "$SANDBOX_ENABLED" && -S "$DOCKER_SOCKET_PATH" ]]; then
  DOCKER_GID="$(stat -c '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || stat -f '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || echo "")"
fi
export DOCKER_GID

if [[ -z "${MANGABACLAW_GATEWAY_TOKEN:-}" ]]; then
  EXISTING_CONFIG_TOKEN="$(read_config_gateway_token || true)"
  if [[ -n "$EXISTING_CONFIG_TOKEN" ]]; then
    MANGABACLAW_GATEWAY_TOKEN="$EXISTING_CONFIG_TOKEN"
    echo "Reusing gateway token from $MANGABACLAW_CONFIG_DIR/mangabaclaw.json"
  else
    DOTENV_GATEWAY_TOKEN="$(read_env_gateway_token "$ROOT_DIR/.env" || true)"
    if [[ -n "$DOTENV_GATEWAY_TOKEN" ]]; then
      MANGABACLAW_GATEWAY_TOKEN="$DOTENV_GATEWAY_TOKEN"
      echo "Reusing gateway token from $ROOT_DIR/.env"
    elif command -v openssl >/dev/null 2>&1; then
      MANGABACLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
    else
      MANGABACLAW_GATEWAY_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
    fi
  fi
fi
export MANGABACLAW_GATEWAY_TOKEN

COMPOSE_FILES=("$COMPOSE_FILE")
COMPOSE_ARGS=()

write_extra_compose() {
  local home_volume="$1"
  shift
  local mount
  local gateway_home_mount
  local gateway_config_mount
  local gateway_workspace_mount
  local gateway_auth_profile_secret_mount

  cat >"$EXTRA_COMPOSE_FILE" <<'YAML'
services:
  mangabaclaw-gateway:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    gateway_home_mount="${home_volume}:/home/node"
    gateway_config_mount="${MANGABACLAW_CONFIG_DIR}:/home/node/.mangabaclaw"
    gateway_workspace_mount="${MANGABACLAW_WORKSPACE_DIR}:/home/node/.mangabaclaw/workspace"
    gateway_auth_profile_secret_mount="${MANGABACLAW_AUTH_PROFILE_SECRET_DIR}:/home/node/.config/mangabaclaw"
    validate_mount_spec "$gateway_home_mount"
    validate_mount_spec "$gateway_config_mount"
    validate_mount_spec "$gateway_workspace_mount"
    validate_mount_spec "$gateway_auth_profile_secret_mount"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_home_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_config_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_workspace_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_auth_profile_secret_mount")" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    validate_mount_spec "$mount"
    printf '      - %s\n' "$(quote_yaml_string "$mount")" >>"$EXTRA_COMPOSE_FILE"
  done

  cat >>"$EXTRA_COMPOSE_FILE" <<'YAML'
  mangabaclaw-cli:
    volumes:
YAML

  if [[ -n "$home_volume" ]]; then
    printf '      - %s\n' "$(quote_yaml_string "$gateway_home_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_config_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_workspace_mount")" >>"$EXTRA_COMPOSE_FILE"
    printf '      - %s\n' "$(quote_yaml_string "$gateway_auth_profile_secret_mount")" >>"$EXTRA_COMPOSE_FILE"
  fi

  for mount in "$@"; do
    validate_mount_spec "$mount"
    printf '      - %s\n' "$(quote_yaml_string "$mount")" >>"$EXTRA_COMPOSE_FILE"
  done

  if [[ -n "$home_volume" && "$home_volume" != *"/"* ]]; then
    validate_named_volume "$home_volume"
    cat >>"$EXTRA_COMPOSE_FILE" <<YAML
volumes:
  ${home_volume}:
YAML
  fi
}

# When sandbox is requested, ensure Docker CLI build arg is set for local builds.
# Docker socket mount is deferred until sandbox prerequisites are verified.
if [[ -n "$SANDBOX_ENABLED" ]]; then
  if [[ -z "${MANGABACLAW_INSTALL_DOCKER_CLI:-}" ]]; then
    export MANGABACLAW_INSTALL_DOCKER_CLI=1
  fi
fi

VALID_MOUNTS=()
if [[ -n "$EXTRA_MOUNTS" ]]; then
  IFS=',' read -r -a mounts <<<"$EXTRA_MOUNTS"
  for mount in "${mounts[@]}"; do
    mount="${mount#"${mount%%[![:space:]]*}"}"
    mount="${mount%"${mount##*[![:space:]]}"}"
    if [[ -n "$mount" ]]; then
      VALID_MOUNTS+=("$mount")
    fi
  done
fi

if [[ -n "$HOME_VOLUME_NAME" || ${#VALID_MOUNTS[@]} -gt 0 ]]; then
  # Bash 3.2 + nounset treats "${array[@]}" on an empty array as unbound.
  if [[ ${#VALID_MOUNTS[@]} -gt 0 ]]; then
    write_extra_compose "$HOME_VOLUME_NAME" "${VALID_MOUNTS[@]}"
  else
    write_extra_compose "$HOME_VOLUME_NAME"
  fi
  COMPOSE_FILES+=("$EXTRA_COMPOSE_FILE")
fi
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=("-f" "$compose_file")
done
# Keep a base compose arg set without sandbox overlay so rollback paths can
# force a known-safe gateway service definition (no docker.sock mount).
BASE_COMPOSE_ARGS=("${COMPOSE_ARGS[@]}")
COMPOSE_HINT="docker compose"
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_HINT+=" -f ${compose_file}"
done

ENV_FILE="$ROOT_DIR/.env"
upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp
  tmp="$(mktemp)"
  # Use a delimited string instead of an associative array so the script
  # works with Bash 3.2 (macOS default) which lacks `declare -A`.
  local seen=" "

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local replaced=false
      for k in "${keys[@]}"; do
        if [[ "$key" == "$k" ]]; then
          printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
          seen="$seen$k "
          replaced=true
          break
        fi
      done
      if [[ "$replaced" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi

  for k in "${keys[@]}"; do
    if [[ "$seen" != *" $k "* ]]; then
      printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
    fi
  done

  mv "$tmp" "$file"
}

upsert_env "$ENV_FILE" \
  MANGABACLAW_CONFIG_DIR \
  MANGABACLAW_WORKSPACE_DIR \
  MANGABACLAW_AUTH_PROFILE_SECRET_DIR \
  MANGABACLAW_GATEWAY_PORT \
  MANGABACLAW_BRIDGE_PORT \
  MANGABACLAW_GATEWAY_BIND \
  MANGABACLAW_DISABLE_BONJOUR \
  MANGABACLAW_GATEWAY_TOKEN \
  MANGABACLAW_IMAGE \
  MANGABACLAW_EXTRA_MOUNTS \
  MANGABACLAW_HOME_VOLUME \
  MANGABACLAW_IMAGE_APT_PACKAGES \
  MANGABACLAW_IMAGE_PIP_PACKAGES \
  MANGABACLAW_EXTENSIONS \
  MANGABACLAW_DOCKER_BUILD_NODE_OPTIONS \
  MANGABACLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB \
  MANGABACLAW_DOCKER_BUILD_SKIP_DTS \
  MANGABACLAW_INSTALL_BROWSER \
  MANGABACLAW_SANDBOX \
  MANGABACLAW_DOCKER_SOCKET \
  DOCKER_GID \
  MANGABACLAW_INSTALL_DOCKER_CLI \
  MANGABACLAW_ALLOW_INSECURE_PRIVATE_WS \
  MANGABACLAW_TZ \
  OTEL_EXPORTER_OTLP_ENDPOINT \
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT \
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT \
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT \
  OTEL_EXPORTER_OTLP_PROTOCOL \
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL \
  OTEL_EXPORTER_OTLP_METRICS_PROTOCOL \
  OTEL_EXPORTER_OTLP_LOGS_PROTOCOL \
  OTEL_SERVICE_NAME \
  OTEL_SEMCONV_STABILITY_OPT_IN \
  MANGABACLAW_OTEL_PRELOADED \
  MANGABACLAW_SKIP_ONBOARDING

if [[ -n "$OFFLINE_MODE" ]]; then
  require_local_docker_image "$IMAGE_NAME"
  echo "==> Using preloaded Docker image: $IMAGE_NAME"
elif [[ "$IMAGE_NAME" == "mangabaclaw:local" ]]; then
  echo "==> Building Docker image: $IMAGE_NAME"
  BUILD_GIT_COMMIT="$(mangabaclaw_resolve_git_commit "$ROOT_DIR")"
  BUILD_TIMESTAMP="$(mangabaclaw_resolve_build_timestamp)"
  PROVENANCE_BUILD_ARGS=(--build-arg "MANGABACLAW_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}")
  if [[ "$BUILD_GIT_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
    PROVENANCE_BUILD_ARGS+=(--build-arg "GIT_COMMIT=${BUILD_GIT_COMMIT}")
  fi
  run_docker_build \
    "${PROVENANCE_BUILD_ARGS[@]}" \
    --build-arg "MANGABACLAW_IMAGE_APT_PACKAGES=${MANGABACLAW_IMAGE_APT_PACKAGES}" \
    --build-arg "MANGABACLAW_IMAGE_PIP_PACKAGES=${MANGABACLAW_IMAGE_PIP_PACKAGES}" \
    --build-arg "MANGABACLAW_EXTENSIONS=${MANGABACLAW_EXTENSIONS}" \
    --build-arg "MANGABACLAW_DOCKER_BUILD_NODE_OPTIONS=${MANGABACLAW_DOCKER_BUILD_NODE_OPTIONS}" \
    --build-arg "MANGABACLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB=${MANGABACLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB}" \
    --build-arg "MANGABACLAW_DOCKER_BUILD_SKIP_DTS=${MANGABACLAW_DOCKER_BUILD_SKIP_DTS}" \
    --build-arg "MANGABACLAW_INSTALL_BROWSER=${MANGABACLAW_INSTALL_BROWSER}" \
    --build-arg "MANGABACLAW_INSTALL_DOCKER_CLI=${MANGABACLAW_INSTALL_DOCKER_CLI:-}" \
    -t "$IMAGE_NAME" \
    -f "$ROOT_DIR/Dockerfile" \
    "$ROOT_DIR"
else
  echo "==> Pulling Docker image: $IMAGE_NAME"
  if ! run_docker_pull "$IMAGE_NAME"; then
    echo "ERROR: Failed to pull image $IMAGE_NAME. Please check the image name and your access permissions." >&2
    exit 1
  fi
fi

if [[ -n "$TIMEZONE" ]] && ! is_valid_timezone_in_image "$TIMEZONE"; then
  fail "MANGABACLAW_TZ must be supported by $IMAGE_NAME (e.g. Asia/Shanghai)."
fi

# Ensure bind-mounted data directories are writable by the container's `node`
# user (uid 1000). Host-created dirs inherit the host user's uid which may
# differ, causing EACCES when the container tries to mkdir/write.
# Running a brief root container to chown is the portable Docker idiom --
# it works regardless of the host uid and doesn't require host-side root.
echo ""
echo "==> Fixing data-directory permissions"
# Use -xdev to restrict chown to the config-dir mount only — without it,
# the recursive chown would cross into the workspace bind mount and rewrite
# ownership of all user project files on Linux hosts.
# Run a no-dereference chown from each entry's directory. This keeps ownership
# repair for sockets/FIFOs while preventing a swapped symlink leaf from
# redirecting the root operation outside the mounted tree.
# After fixing the config dir, only the MangabaClaw metadata subdirectory
# (.mangabaclaw/) inside the workspace gets chowned, not the user's project files.
run_prestart_gateway --user root --entrypoint sh mangabaclaw-gateway -c \
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; export PATH; \
   /usr/bin/find -P /home/node/.mangabaclaw -xdev -execdir /usr/bin/chown -h node:node {} +; \
   /usr/bin/chown -h node:node /home/node/.config; \
   /usr/bin/find -P /home/node/.config/mangabaclaw -xdev -execdir /usr/bin/chown -h node:node {} +; \
   if [ -d /home/node/.mangabaclaw/workspace/.mangabaclaw ] && [ ! -L /home/node/.mangabaclaw/workspace/.mangabaclaw ]; then \
     /usr/bin/find -P /home/node/.mangabaclaw/workspace/.mangabaclaw -xdev -execdir /usr/bin/chown -h node:node {} +; \
   fi || true'

echo ""
if [[ -n "$SKIP_ONBOARDING" ]]; then
  echo "==> Skipping onboarding (MANGABACLAW_SKIP_ONBOARDING is set)"
else
  echo "==> Onboarding (interactive)"
  echo "Docker setup pins Gateway mode to local."
  echo "Gateway runtime bind comes from MANGABACLAW_GATEWAY_BIND (default: lan)."
  echo "Current runtime bind: $MANGABACLAW_GATEWAY_BIND"
  if is_truthy_value "$MANGABACLAW_DISABLE_BONJOUR"; then
    echo "Bonjour/mDNS advertising: force disabled (MANGABACLAW_DISABLE_BONJOUR=$MANGABACLAW_DISABLE_BONJOUR)."
  elif [[ -z "$MANGABACLAW_DISABLE_BONJOUR" ]]; then
    echo "Bonjour/mDNS advertising: auto (disabled inside the Gateway container unless explicitly enabled)."
  else
    echo "Bonjour/mDNS advertising: explicitly enabled (MANGABACLAW_DISABLE_BONJOUR=$MANGABACLAW_DISABLE_BONJOUR)."
  fi
  echo "Gateway token: stored in Docker environment/config (not printed)."
  echo "Tailscale exposure: Off (use host-level tailnet/Tailscale setup separately)."
  echo "Install Gateway daemon: No (managed by Docker Compose)"
  echo ""
  run_prestart_cli onboard \
    --mode local \
    --no-install-daemon \
    --gateway-auth token \
    --gateway-token-ref-env MANGABACLAW_GATEWAY_TOKEN \
    --skip-ui \
    --suppress-gateway-token-output
fi

echo ""
echo "==> Docker gateway defaults"
sync_gateway_config

echo ""
echo "==> Provider setup (optional)"
echo "WhatsApp (QR):"
echo "  ${COMPOSE_HINT} run --rm mangabaclaw-cli channels login"
echo "Telegram (bot token):"
echo "  ${COMPOSE_HINT} run --rm mangabaclaw-cli channels add --channel telegram --token <token>"
echo "Discord (bot token):"
echo "  ${COMPOSE_HINT} run --rm mangabaclaw-cli channels add --channel discord --token <token>"
echo "Docs: https://docs.openclaw.ai/channels"

if [[ -n "$SANDBOX_ENABLED" && -n "$OFFLINE_MODE" ]]; then
  echo ""
  echo "==> Sandbox preflight"
  validate_offline_sandbox_prerequisites
fi

echo ""
echo "==> Starting gateway"
run_gateway_up current

# --- Sandbox setup (opt-in via MANGABACLAW_SANDBOX=1) ---
if [[ -n "$SANDBOX_ENABLED" ]]; then
  echo ""
  echo "==> Sandbox setup"

  sandbox_dockerfile="$ROOT_DIR/scripts/docker/sandbox/Dockerfile"
  if [[ -z "$OFFLINE_MODE" && ! -S "$DOCKER_SOCKET_PATH" ]]; then
    echo "WARNING: MANGABACLAW_SANDBOX enabled but Docker socket not found at $DOCKER_SOCKET_PATH." >&2
    echo "  Sandbox requires Docker socket access. Skipping sandbox setup." >&2
    SANDBOX_ENABLED=""
  fi

  if [[ -n "$SANDBOX_ENABLED" && -z "$OFFLINE_MODE" && -f "$sandbox_dockerfile" ]]; then
    echo "Building sandbox image: $DEFAULT_SANDBOX_IMAGE"
    run_docker_build \
      -t "$DEFAULT_SANDBOX_IMAGE" \
      -f "$sandbox_dockerfile" \
      "$ROOT_DIR"
  elif [[ -n "$SANDBOX_ENABLED" && -z "$OFFLINE_MODE" ]]; then
    echo "WARNING: sandbox Dockerfile not found at $sandbox_dockerfile" >&2
    echo "  Sandbox config will be applied but no sandbox image will be built." >&2
    echo "  Agent exec may fail if the configured sandbox image does not exist." >&2
  fi

  # Defense-in-depth: verify Docker CLI in the running image before enabling
  # sandbox. This avoids claiming sandbox is enabled when the image cannot
  # launch sandbox containers.
  if [[ -n "$SANDBOX_ENABLED" && -z "$OFFLINE_MODE" ]] &&
    ! run_compose_one_off --rm --entrypoint docker mangabaclaw-gateway --version >/dev/null 2>&1; then
    echo "WARNING: Docker CLI not found inside the container image." >&2
    echo "  Sandbox requires Docker CLI. Rebuild with --build-arg MANGABACLAW_INSTALL_DOCKER_CLI=1" >&2
    echo "  or use a local build (MANGABACLAW_IMAGE=mangabaclaw:local). Skipping sandbox setup." >&2
    SANDBOX_ENABLED=""
  fi
fi

# Apply sandbox config only if prerequisites are met.
if [[ -n "$SANDBOX_ENABLED" ]]; then
  # Mount Docker socket via a dedicated compose overlay. This overlay is
  # created only after sandbox prerequisites pass, so the socket is never
  # exposed when sandbox cannot actually run.
  SANDBOX_COMPOSE_FILE="$ROOT_DIR/docker-compose.sandbox.yml"
  cat >"$SANDBOX_COMPOSE_FILE" <<YAML
services:
  mangabaclaw-gateway:
    volumes:
      - $(quote_yaml_string "${DOCKER_SOCKET_PATH}:/var/run/docker.sock")
YAML
  if [[ -n "${DOCKER_GID:-}" ]]; then
    cat >>"$SANDBOX_COMPOSE_FILE" <<YAML
    group_add:
      - "${DOCKER_GID}"
YAML
  fi
  COMPOSE_ARGS+=("-f" "$SANDBOX_COMPOSE_FILE")
  echo "==> Sandbox: added Docker socket mount"
fi

if [[ -n "$SANDBOX_ENABLED" ]]; then
  # Enable sandbox in MangabaClaw config.
  sandbox_config_ok=true
  if ! run_runtime_cli current no-deps \
    config set agents.defaults.sandbox.mode "non-main" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.mode" >&2
    sandbox_config_ok=false
  fi
  if ! run_runtime_cli current no-deps \
    config set agents.defaults.sandbox.scope "agent" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.scope" >&2
    sandbox_config_ok=false
  fi
  if ! run_runtime_cli current no-deps \
    config set agents.defaults.sandbox.workspaceAccess "none" >/dev/null; then
    echo "WARNING: Failed to set agents.defaults.sandbox.workspaceAccess" >&2
    sandbox_config_ok=false
  fi

  if [[ "$sandbox_config_ok" == true ]]; then
    echo "Sandbox enabled: mode=non-main, scope=agent, workspaceAccess=none"
    echo "Docs: https://docs.openclaw.ai/gateway/sandboxing"
    # Restart gateway with sandbox compose overlay to pick up socket mount + config.
    run_gateway_up current
  else
    echo "WARNING: Sandbox config was partially applied. Check errors above." >&2
    echo "  Skipping gateway restart to avoid exposing Docker socket without a full sandbox policy." >&2
    if ! run_runtime_cli base no-deps \
      config set agents.defaults.sandbox.mode "off" >/dev/null; then
      echo "WARNING: Failed to roll back agents.defaults.sandbox.mode to off" >&2
    else
      echo "Sandbox mode rolled back to off due to partial sandbox config failure."
    fi
    if [[ -n "${SANDBOX_COMPOSE_FILE:-}" ]]; then
      rm -f "$SANDBOX_COMPOSE_FILE"
    fi
    # Ensure gateway service definition is reset without sandbox overlay mount.
    run_gateway_up base --force-recreate
  fi
else
  # Keep reruns deterministic: if sandbox is not active for this run, reset
  # persisted sandbox mode so future execs do not require docker.sock by stale
  # config alone.
  if ! run_runtime_cli current with-deps \
    config set agents.defaults.sandbox.mode "off" >/dev/null; then
    echo "WARNING: Failed to reset agents.defaults.sandbox.mode to off" >&2
  fi
  if [[ -f "$ROOT_DIR/docker-compose.sandbox.yml" ]]; then
    rm -f "$ROOT_DIR/docker-compose.sandbox.yml"
  fi
fi

echo ""
echo "Gateway running with host port mapping."
echo "Access from tailnet devices via the host's tailnet IP."
echo "Config: $MANGABACLAW_CONFIG_DIR"
echo "Workspace: $MANGABACLAW_WORKSPACE_DIR"
echo "Token: stored in Docker environment/config (not printed)."
echo ""
echo "Commands:"
echo "  ${COMPOSE_HINT} logs -f mangabaclaw-gateway"
echo "  ${COMPOSE_HINT} exec mangabaclaw-gateway sh -lc 'node dist/index.js gateway health --token \"\$MANGABACLAW_GATEWAY_TOKEN\"'"
