#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="${MANGABACLAW_LIVE_DOCKER_REPO_ROOT:-$SCRIPT_ROOT_DIR}"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"
TRUSTED_HARNESS_DIR="${MANGABACLAW_LIVE_DOCKER_TRUSTED_HARNESS_DIR:-$SCRIPT_ROOT_DIR}"
if [[ -z "$TRUSTED_HARNESS_DIR" || ! -d "$TRUSTED_HARNESS_DIR" ]]; then
  echo "ERROR: trusted live Docker harness directory not found: ${TRUSTED_HARNESS_DIR:-<empty>}." >&2
  exit 1
fi
TRUSTED_HARNESS_DIR="$(cd "$TRUSTED_HARNESS_DIR" && pwd)"
source "$TRUSTED_HARNESS_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${MANGABACLAW_IMAGE:-mangabaclaw:local}"
LIVE_IMAGE_NAME="${MANGABACLAW_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${MANGABACLAW_CONFIG_DIR:-$HOME/.mangabaclaw}"
WORKSPACE_DIR="${MANGABACLAW_WORKSPACE_DIR:-$HOME/.mangabaclaw/workspace}"
PROFILE_FILE="$(mangabaclaw_live_default_profile_file)"
ACP_AGENT_LIST_RAW="${MANGABACLAW_LIVE_ACP_BIND_AGENTS:-${MANGABACLAW_LIVE_ACP_BIND_AGENT:-claude,codex,gemini}}"
ACP_CLAUDE_AUTH_MODE="${MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH:-auto}"
ACP_SETUP_TIMEOUT_SECONDS="$(mangabaclaw_live_read_positive_int_env MANGABACLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS 180)"
DOCKER_TRUSTED_HARNESS_CONTAINER_DIR="/trusted-harness"
DOCKER_TRUSTED_HARNESS_MOUNT=(-v "$TRUSTED_HARNESS_DIR":"$DOCKER_TRUSTED_HARNESS_CONTAINER_DIR":ro)

mangabaclaw_live_acp_bind_append_build_extension() {
  local extension="${1:?extension required}"
  local current="${MANGABACLAW_DOCKER_BUILD_EXTENSIONS:-${MANGABACLAW_EXTENSIONS:-}}"
  case " $current " in
    *" $extension "*)
      ;;
    *)
      export MANGABACLAW_DOCKER_BUILD_EXTENSIONS="${current:+$current }$extension"
      ;;
  esac
}

mangabaclaw_live_acp_bind_resolve_auth_provider() {
  case "${1:-}" in
    claude) printf '%s\n' "claude-cli" ;;
    codex) printf '%s\n' "codex-cli" ;;
    droid) printf '%s\n' "droid" ;;
    gemini) printf '%s\n' "google-gemini-cli" ;;
    opencode) printf '%s\n' "opencode" ;;
    *)
      echo "Unsupported MANGABACLAW_LIVE_ACP_BIND agent: ${1:-} (expected claude, codex, droid, gemini, or opencode)" >&2
      return 1
      ;;
  esac
}

mangabaclaw_live_acp_bind_resolve_agent_command() {
  case "${1:-}" in
    claude) printf '%s' "${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND_CLAUDE:-${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    codex) printf '%s' "${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND_CODEX:-${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    droid) printf '%s' "${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND_DROID:-${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    gemini) printf '%s' "${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND_GEMINI:-${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    opencode) printf '%s' "${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND_OPENCODE:-${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    *) return 1 ;;
  esac
}

case "$ACP_CLAUDE_AUTH_MODE" in
  auto | api-key | subscription)
    ;;
  *)
    echo "ERROR: MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH must be one of: auto, api-key, subscription." >&2
    exit 1
    ;;
esac

mangabaclaw_live_init_temp_dirs
mangabaclaw_live_init_cli_tools_dir
mangabaclaw_live_init_cache_home_dir
mangabaclaw_live_acp_bind_load_factory_api_key_from_profile() {
  [[ -z "${FACTORY_API_KEY:-}" ]] || return 0
  [[ -f "$PROFILE_FILE" && -r "$PROFILE_FILE" ]] || return 0
  [[ "$PROFILE_FILE" != "$HOME/.profile" ]] || return 0

  local line value
  line="$(sed -nE 's/^(export[[:space:]]+)?FACTORY_API_KEY=//p' "$PROFILE_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="$line"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi
  [[ -n "$value" ]] || return 0
  export FACTORY_API_KEY="$value"
}

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && [ -r "$HOME/.profile" ] && source "$HOME/.profile" || true
export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export npm_config_prefix="$NPM_CONFIG_PREFIX"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export COREPACK_HOME="${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$XDG_CACHE_HOME/npm}"
export npm_config_cache="$NPM_CONFIG_CACHE"
mkdir -p "$NPM_CONFIG_PREFIX" "$HOME/.local/bin" "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE"
chmod 700 "$XDG_CACHE_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" || true
export PATH="$HOME/.local/bin:$NPM_CONFIG_PREFIX/bin:$PATH"
trusted_scripts_dir="${MANGABACLAW_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"
source "$trusted_scripts_dir/lib/live-docker-stage.sh"
mangabaclaw_live_stage_mounted_auth
run_setup_command() {
  mangabaclaw_live_run_setup_command \
    "${MANGABACLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS:?missing live ACP bind setup timeout seconds}" \
    "live ACP bind setup" \
    "$@"
}
agent="${MANGABACLAW_LIVE_ACP_BIND_AGENT:-claude}"
case "$agent" in
  claude)
    claude_auth_mode="${MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH:-auto}"
    if [ "$claude_auth_mode" = "subscription" ]; then
      unset ANTHROPIC_API_KEY
      unset ANTHROPIC_API_KEY_OLD
      unset ANTHROPIC_API_TOKEN
      unset ANTHROPIC_AUTH_TOKEN
      unset ANTHROPIC_OAUTH_TOKEN
    fi
    claude_code_version="$(
      node -e 'const path = require("node:path"); const packagePath = path.join(path.dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"); process.stdout.write(require(packagePath).claudeCodeVersion);'
    )"
    claude_package_json="$NPM_CONFIG_PREFIX/lib/node_modules/@anthropic-ai/claude-code/package.json"
    real_claude="$NPM_CONFIG_PREFIX/bin/claude-real"
    installed_claude_code_version=""
    if [ -f "$claude_package_json" ]; then
      installed_claude_code_version="$(
        node -e 'process.stdout.write(require(process.argv[1]).version);' \
          "$claude_package_json" 2>/dev/null || true
      )"
    fi
    if [ "$installed_claude_code_version" != "$claude_code_version" ]; then
      rm -f "$NPM_CONFIG_PREFIX/bin/claude" "$real_claude"
      run_setup_command npm install -g "@anthropic-ai/claude-code@$claude_code_version"
    fi
    if [ ! -x "$real_claude" ] && [ -x "$NPM_CONFIG_PREFIX/bin/claude" ]; then
      mv "$NPM_CONFIG_PREFIX/bin/claude" "$real_claude"
    fi
    if [ -x "$real_claude" ]; then
      cat > "$NPM_CONFIG_PREFIX/bin/claude" <<WRAP
#!/usr/bin/env bash
script_dir="\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)"
if [ "\${MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH:-auto}" = "subscription" ]; then
  unset ANTHROPIC_API_KEY ANTHROPIC_API_KEY_OLD ANTHROPIC_API_TOKEN
  unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_OAUTH_TOKEN
else
  if [ -n "\${MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY:-}" ]; then
    export ANTHROPIC_API_KEY="\${MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY}"
  fi
  if [ -n "\${MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD:-}" ]; then
    export ANTHROPIC_API_KEY_OLD="\${MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD}"
  fi
fi
exec "\$script_dir/claude-real" "\$@"
WRAP
      chmod +x "$NPM_CONFIG_PREFIX/bin/claude"
    fi
    export CLAUDE_CODE_EXECUTABLE="$NPM_CONFIG_PREFIX/bin/claude"
    echo "Using Claude Code $claude_code_version declared by the installed Claude Agent SDK"
    claude --version
    claude auth status || true
    ;;
  codex)
    if [ ! -x "$NPM_CONFIG_PREFIX/bin/codex" ]; then
      run_setup_command npm install -g @openai/codex
    fi
    ;;
  droid)
    if ! command -v droid >/dev/null 2>&1; then
      run_setup_command bash -lc 'curl -fsSL https://app.factory.ai/cli | sh'
      export PATH="$HOME/.local/bin:$PATH"
    fi
    droid --version
    if [ -z "${FACTORY_API_KEY:-}" ]; then
      echo "ERROR: Droid Docker ACP bind requires FACTORY_API_KEY; Factory OAuth/keyring auth in ~/.factory is not portable into the container." >&2
      exit 1
    fi
    ;;
  gemini)
    mkdir -p "$HOME/.gemini"
    if [ ! -x "$NPM_CONFIG_PREFIX/bin/gemini" ]; then
      run_setup_command npm install -g @google/gemini-cli
    fi
    if [ -n "${GEMINI_API_KEY:-}" ] || [ -n "${GOOGLE_API_KEY:-}" ]; then
      gemini_auth_type="gemini-api-key"
      if [ -z "${GEMINI_API_KEY:-}" ] && [ -n "${GOOGLE_API_KEY:-}" ]; then
        gemini_auth_type="vertex-ai"
        export GOOGLE_GENAI_USE_VERTEXAI="${GOOGLE_GENAI_USE_VERTEXAI:-true}"
      fi
      GEMINI_CLI_AUTH_TYPE="$gemini_auth_type" node <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const settingsPath = path.join(os.homedir(), ".gemini", "settings.json");
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch {}
settings.security = settings.security && typeof settings.security === "object" ? settings.security : {};
settings.security.auth =
  settings.security.auth && typeof settings.security.auth === "object" ? settings.security.auth : {};
settings.security.auth.selectedType = process.env.GEMINI_CLI_AUTH_TYPE;
settings.security.auth.enforcedType = process.env.GEMINI_CLI_AUTH_TYPE;
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE
      echo "Using Gemini CLI auth type $gemini_auth_type"
    fi
    ;;
  opencode)
    if [ ! -x "$NPM_CONFIG_PREFIX/bin/opencode" ]; then
      run_setup_command npm install -g opencode-ai
    fi
    export OPENCODE_CONFIG_CONTENT="$(
      node -e 'process.stdout.write(JSON.stringify({model: process.env.MANGABACLAW_LIVE_ACP_BIND_OPENCODE_MODEL || "opencode/kimi-k2.6"}))'
    )"
    ;;
  *)
    echo "Unsupported MANGABACLAW_LIVE_ACP_BIND_AGENT: $agent" >&2
    exit 1
    ;;
esac
tmp_dir="$(mktemp -d)"
mangabaclaw_live_stage_source_tree "$tmp_dir"
mangabaclaw_live_stage_node_modules "$tmp_dir"
mangabaclaw_live_link_runtime_tree "$tmp_dir"
mangabaclaw_live_stage_state_dir "$tmp_dir/.mangabaclaw-state"
mangabaclaw_live_prepare_staged_config
cd "$tmp_dir"
export MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND="${MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}"
node --import tsx scripts/test-live.mts -- ${MANGABACLAW_LIVE_ACP_BIND_TEST_FILES:-src/gateway/gateway-acp-bind.live.test.ts}
EOF

mangabaclaw_live_acp_bind_append_build_extension acpx
MANGABACLAW_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"

IFS=',' read -r -a ACP_AGENT_TOKENS <<<"$ACP_AGENT_LIST_RAW"
ACP_AGENTS=()
for token in "${ACP_AGENT_TOKENS[@]}"; do
  agent="$(mangabaclaw_live_trim "$token")"
  [[ -n "$agent" ]] || continue
  mangabaclaw_live_acp_bind_resolve_auth_provider "$agent" >/dev/null
  ACP_AGENTS+=("$agent")
done

if ((${#ACP_AGENTS[@]} == 0)); then
  echo "No ACP bind agents selected. Use MANGABACLAW_LIVE_ACP_BIND_AGENTS=claude,codex,droid,gemini,opencode." >&2
  exit 1
fi

for ACP_AGENT in "${ACP_AGENTS[@]}"; do
  AUTH_PROVIDER="$(mangabaclaw_live_acp_bind_resolve_auth_provider "$ACP_AGENT")"
  AGENT_COMMAND="$(mangabaclaw_live_acp_bind_resolve_agent_command "$ACP_AGENT")"

  mangabaclaw_live_collect_auth_for_providers "$AUTH_PROVIDER"
  DOCKER_AUTH_PRESTAGED=0
  mangabaclaw_live_init_managed_home
  mangabaclaw_live_init_profile_mount
  mangabaclaw_live_finalize_auth_mounts

  if [[ "$ACP_AGENT" == "droid" ]]; then
    mangabaclaw_live_acp_bind_load_factory_api_key_from_profile
  fi
  if [[ "$ACP_AGENT" == "droid" && -z "${FACTORY_API_KEY:-}" ]]; then
    echo "==> Run ACP bind live test in Docker"
    echo "==> Agent: $ACP_AGENT"
    echo "==> Profile file: $PROFILE_STATUS"
    echo "==> Auth dirs: ${AUTH_DIRS_CSV:-none}"
    echo "==> Auth files: ${AUTH_FILES_CSV:-none}"
    echo "ERROR: Droid Docker ACP bind requires FACTORY_API_KEY; Factory OAuth/keyring auth in ~/.factory is not portable into the container." >&2
    exit 1
  fi
  CLAUDE_AUTH_MODE="$ACP_CLAUDE_AUTH_MODE"
  if [[ "$ACP_AGENT" == "claude" && "$CLAUDE_AUTH_MODE" == "auto" ]]; then
    if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" || -f "$HOME/.claude/.credentials.json" ]]; then
      CLAUDE_AUTH_MODE="subscription"
    else
      CLAUDE_AUTH_MODE="api-key"
    fi
  fi

  echo "==> Run ACP bind live test in Docker"
  echo "==> Agent: $ACP_AGENT"
  echo "==> Test files: ${MANGABACLAW_LIVE_ACP_BIND_TEST_FILES:-src/gateway/gateway-acp-bind.live.test.ts}"
  echo "==> Profile file: $PROFILE_STATUS"
  echo "==> Auth dirs: ${AUTH_DIRS_CSV:-none}"
  echo "==> Auth files: ${AUTH_FILES_CSV:-none}"
  if [[ "$ACP_AGENT" == "claude" ]]; then
    echo "==> Claude auth mode: $CLAUDE_AUTH_MODE"
  fi
  if mangabaclaw_live_uses_managed_bind_dirs; then
    mangabaclaw_live_chown_bind_dirs_for_container_user \
      "$LIVE_IMAGE_NAME" \
      "$DOCKER_USER" \
      "$CLI_TOOLS_DIR" \
      "$CACHE_HOME_DIR" \
      "${DOCKER_HOME_DIR:-}"
  fi
  DOCKER_RUN_ARGS=()
  mangabaclaw_live_init_docker_run_args DOCKER_RUN_ARGS "${MANGABACLAW_LIVE_ACP_BIND_DOCKER_RUN_TIMEOUT:-2700s}"
  DOCKER_AUTH_ENV=()
  if [[ "$ACP_AGENT" == "claude" && "$CLAUDE_AUTH_MODE" == "subscription" ]]; then
    DOCKER_AUTH_ENV+=(
      -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"
      -e MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH="$CLAUDE_AUTH_MODE"
    )
  elif [[ "$ACP_AGENT" == "claude" ]]; then
    DOCKER_AUTH_ENV+=(
      -e ANTHROPIC_API_KEY
      -e ANTHROPIC_API_KEY_OLD
      -e MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
      -e MANGABACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD="${ANTHROPIC_API_KEY_OLD:-}"
      -e MANGABACLAW_LIVE_ACP_BIND_CLAUDE_AUTH="$CLAUDE_AUTH_MODE"
    )
  fi
  DOCKER_RUN_ARGS+=(--rm -t \
    -u "$DOCKER_USER" \
    --entrypoint bash \
    -e GEMINI_API_KEY \
    -e GOOGLE_API_KEY \
    -e FACTORY_API_KEY \
    -e OPENAI_API_KEY \
    -e CODEX_API_KEY \
    -e ACPX_AUTH_OPENAI_API_KEY \
    -e ACPX_AUTH_CODEX_API_KEY \
    -e OPENCODE_API_KEY \
    -e OPENCODE_ZEN_API_KEY \
    -e OPENCODE_CONFIG_CONTENT \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -e HOME=/home/node \
    -e NODE_OPTIONS="$(mangabaclaw_live_container_node_options)" \
    -e MANGABACLAW_SKIP_CHANNELS=1 \
    -e MANGABACLAW_VITEST_FS_MODULE_CACHE=0 \
    -e MANGABACLAW_DOCKER_AUTH_PRESTAGED="$DOCKER_AUTH_PRESTAGED" \
    -e MANGABACLAW_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
    -e MANGABACLAW_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
    -e MANGABACLAW_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts" \
    -e MANGABACLAW_LIVE_DOCKER_SOURCE_STAGE_MODE="${MANGABACLAW_LIVE_DOCKER_SOURCE_STAGE_MODE:-copy}" \
    -e MANGABACLAW_LIVE_TEST=1 \
    -e MANGABACLAW_LIVE_ACP_BIND=1 \
    -e MANGABACLAW_LIVE_ACP_BIND_AGENT="$ACP_AGENT" \
    -e MANGABACLAW_LIVE_ACP_BIND_REQUIRE_CRON="${MANGABACLAW_LIVE_ACP_BIND_REQUIRE_CRON:-}" \
    -e MANGABACLAW_LIVE_ACP_BIND_TEST_FILES="${MANGABACLAW_LIVE_ACP_BIND_TEST_FILES:-}" \
    -e MANGABACLAW_LIVE_ACP_BIND_CODEX_MODEL="${MANGABACLAW_LIVE_ACP_BIND_CODEX_MODEL:-}" \
    -e MANGABACLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS="$ACP_SETUP_TIMEOUT_SECONDS" \
    -e MANGABACLAW_LIVE_ACP_BIND_OPENCODE_MODEL="${MANGABACLAW_LIVE_ACP_BIND_OPENCODE_MODEL:-opencode/kimi-k2.6}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS:-}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_AGENT="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_AGENT:-}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_CONNECT_TIMEOUT_MS="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_CONNECT_TIMEOUT_MS:-}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_MODEL="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_MODEL:-}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_THINKING="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_THINKING:-}" \
    -e MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_TIMEOUT_MS="${MANGABACLAW_LIVE_ACP_SPAWN_DEFAULTS_TIMEOUT_MS:-}" \
    -e MANGABACLAW_LIVE_ACP_BIND_AGENT_COMMAND="$AGENT_COMMAND")
  mangabaclaw_live_append_array DOCKER_RUN_ARGS DOCKER_AUTH_ENV
  mangabaclaw_live_append_array DOCKER_RUN_ARGS DOCKER_HOME_MOUNT
  mangabaclaw_live_append_array DOCKER_RUN_ARGS DOCKER_TRUSTED_HARNESS_MOUNT
  DOCKER_RUN_ARGS+=(\
    -v "$CACHE_HOME_DIR":/home/node/.cache \
    -v "$ROOT_DIR":/src:ro \
    -v "$CONFIG_DIR":/home/node/.mangabaclaw \
    -v "$WORKSPACE_DIR":/home/node/.mangabaclaw/workspace \
    -v "$CLI_TOOLS_DIR":/home/node/.npm-global)
  mangabaclaw_live_append_array DOCKER_RUN_ARGS EXTERNAL_AUTH_MOUNTS
  mangabaclaw_live_append_array DOCKER_RUN_ARGS PROFILE_MOUNT
  DOCKER_RUN_ARGS+=(\
    "$LIVE_IMAGE_NAME" \
    -lc "$LIVE_TEST_CMD")
  "${DOCKER_RUN_ARGS[@]}"
done
