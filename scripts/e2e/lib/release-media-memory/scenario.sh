#!/usr/bin/env bash
set -euo pipefail
trap "" PIPE
export TERM=xterm-256color
export NO_COLOR=1

source scripts/lib/mangabaclaw-e2e-instance.sh

mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}"
mangabaclaw_e2e_install_trash_shim

export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
export npm_config_loglevel=error
export npm_config_fund=false
export npm_config_audit=false
export OPENAI_API_KEY="sk-mangabaclaw-release-media-memory"
export MANGABACLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER=1

PORT="18789"
MOCK_PORT="44200"
SUCCESS_MARKER="MANGABACLAW_E2E_OK_MEDIA_MEMORY"
MEMORY_MARKER="release-media-memory-saffron-$(date +%s)"
media_root="$(mktemp -d /tmp/mangabaclaw-release-media-memory.XXXXXX)"
INSTALL_LOG="$media_root/install.log"
ONBOARD_LOG="$media_root/onboard.log"
ENV_LOG="$media_root/env.log"
CONFIG_JSON="$media_root/config.json"
PACKAGE_FILES_LOG="$media_root/package-files.log"
PLUGINS_JSON="$media_root/plugins.json"
PLUGINS_STDERR_LOG="$media_root/plugins.stderr.log"
MOCK_OPENAI_LOG="$media_root/openai.log"
MOCK_REQUEST_LOG="$media_root/openai-requests.jsonl"
DESCRIBE_JSON="$media_root/describe.json"
DESCRIBE_STDERR_LOG="$media_root/describe.stderr.log"
GENERATE_JSON="$media_root/generate.json"
GENERATE_STDERR_LOG="$media_root/generate.stderr.log"
INDEX_LOG="$media_root/index.log"
SEARCH_BEFORE_JSON="$media_root/search-before.json"
SEARCH_BEFORE_STDERR_LOG="$media_root/search-before.stderr.log"
SEARCH_AFTER_JSON="$media_root/search-after.json"
SEARCH_AFTER_STDERR_LOG="$media_root/search-after.stderr.log"
GATEWAY_1_LOG="$media_root/gateway-1.log"
GATEWAY_2_LOG="$media_root/gateway-2.log"
export SUCCESS_MARKER MOCK_REQUEST_LOG

mock_pid=""
gateway_pid=""
cleanup() {
  mangabaclaw_e2e_terminate_gateways "${gateway_pid:-}"
  mangabaclaw_e2e_stop_process "${mock_pid:-}"
  if [ -n "${media_root:-}" ]; then
    rm -rf "$media_root"
  fi
}
trap cleanup EXIT

dump_debug_logs() {
  local status="$1"
  echo "release media memory failed with exit code $status" >&2
  mangabaclaw_e2e_dump_logs \
    "$INSTALL_LOG" \
    "$ONBOARD_LOG" \
    "$ENV_LOG" \
    "$CONFIG_JSON" \
    "$PACKAGE_FILES_LOG" \
    "$PLUGINS_JSON" \
    "$PLUGINS_STDERR_LOG" \
    "$MOCK_OPENAI_LOG" \
    "$MOCK_REQUEST_LOG" \
    "$DESCRIBE_JSON" \
    "$DESCRIBE_STDERR_LOG" \
    "$GENERATE_JSON" \
    "$GENERATE_STDERR_LOG" \
    "$INDEX_LOG" \
    "$SEARCH_BEFORE_JSON" \
    "$SEARCH_BEFORE_STDERR_LOG" \
    "$SEARCH_AFTER_JSON" \
    "$SEARCH_AFTER_STDERR_LOG" \
    "$GATEWAY_1_LOG" \
    "$GATEWAY_2_LOG"
}
trap 'status=$?; dump_debug_logs "$status"; exit "$status"' ERR

start_gateway() {
  local log_path="$1"
  gateway_pid="$(mangabaclaw_e2e_start_gateway "$entry" "$PORT" "$log_path")"
  mangabaclaw_e2e_wait_gateway_ready "$gateway_pid" "$log_path" 300 "$PORT"
}

stop_gateway() {
  mangabaclaw_e2e_terminate_gateways "${gateway_pid:-}"
  gateway_pid=""
}

mangabaclaw_e2e_install_package "$INSTALL_LOG"
command -v mangabaclaw >/dev/null
package_root="$(mangabaclaw_e2e_package_root)"
entry="$(mangabaclaw_e2e_package_entrypoint "$package_root")"
{
  printf 'mangabaclaw=%s\n' "$(command -v mangabaclaw)"
  printf 'package_root=%s\n' "$package_root"
  printf 'entry=%s\n' "$entry"
  printf 'HOME=%s\n' "$HOME"
  printf 'MANGABACLAW_HOME=%s\n' "$MANGABACLAW_HOME"
  printf 'MANGABACLAW_STATE_DIR=%s\n' "$MANGABACLAW_STATE_DIR"
  printf 'MANGABACLAW_CONFIG_PATH=%s\n' "$MANGABACLAW_CONFIG_PATH"
} >"$ENV_LOG"
mangabaclaw_e2e_enable_mangabaclaw_cli_timeout
(
  cd "$package_root/dist/extensions/memory-core"
  find . -type f | sed 's#^\./##' | sort
) >"$PACKAGE_FILES_LOG"

mock_pid="$(mangabaclaw_e2e_start_mock_openai "$MOCK_PORT" "$MOCK_OPENAI_LOG")"
mangabaclaw_e2e_wait_mock_openai "$MOCK_PORT"

mangabaclaw onboard \
  --non-interactive \
  --accept-risk \
  --flow quickstart \
  --mode local \
  --auth-choice skip \
  --gateway-port "$PORT" \
  --gateway-bind loopback \
  --skip-daemon \
  --skip-ui \
  --skip-channels \
  --skip-skills \
  --skip-health >"$ONBOARD_LOG" 2>&1
cp "$MANGABACLAW_CONFIG_PATH" "$CONFIG_JSON"
mangabaclaw plugins list --json >"$PLUGINS_JSON" 2>"$PLUGINS_STDERR_LOG"
node scripts/e2e/lib/release-scenarios/assertions.mjs assert-file-contains "$PLUGINS_JSON" memory-core
node scripts/e2e/lib/release-scenarios/assertions.mjs configure-mock-openai "$MOCK_PORT"

mkdir -p "$MANGABACLAW_STATE_DIR/workspace/memory"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yf7kAAAAASUVORK5CYII=' | base64 -d >"$media_root/input.png"

mangabaclaw infer image describe \
  --file "$media_root/input.png" \
  --model openai/gpt-5.6-luna \
  --prompt "Describe this image and return marker $SUCCESS_MARKER" \
  --json >"$DESCRIBE_JSON" 2>"$DESCRIBE_STDERR_LOG"
node scripts/e2e/lib/release-scenarios/assertions.mjs assert-image-describe "$DESCRIBE_JSON" "$MOCK_REQUEST_LOG"

mangabaclaw infer image generate \
  --model openai/gpt-image-1 \
  --prompt "Generate a tiny test image for $SUCCESS_MARKER" \
  --output "$media_root/generated.png" \
  --json >"$GENERATE_JSON" 2>"$GENERATE_STDERR_LOG"
node scripts/e2e/lib/release-scenarios/assertions.mjs assert-image-generate "$GENERATE_JSON" "$MOCK_REQUEST_LOG"

cat >"$MANGABACLAW_STATE_DIR/workspace/MEMORY.md" <<EOF
# Long-term memory

- The release media memory marker is $MEMORY_MARKER.
EOF

mangabaclaw memory index --force >"$INDEX_LOG" 2>&1
mangabaclaw memory search "$MEMORY_MARKER" --json >"$SEARCH_BEFORE_JSON" 2>"$SEARCH_BEFORE_STDERR_LOG"
node scripts/e2e/lib/release-scenarios/assertions.mjs assert-memory-search "$SEARCH_BEFORE_JSON" "$MEMORY_MARKER"

start_gateway "$GATEWAY_1_LOG"
stop_gateway
start_gateway "$GATEWAY_2_LOG"
mangabaclaw memory search "$MEMORY_MARKER" --json >"$SEARCH_AFTER_JSON" 2>"$SEARCH_AFTER_STDERR_LOG"
node scripts/e2e/lib/release-scenarios/assertions.mjs assert-memory-search "$SEARCH_AFTER_JSON" "$MEMORY_MARKER"
stop_gateway

echo "Release media memory scenario passed."
