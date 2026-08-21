#!/usr/bin/env bash
set -euo pipefail
trap "" PIPE
export TERM=xterm-256color
source scripts/lib/mangabaclaw-e2e-instance.sh
MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY="${MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY:-0}"
if [ "$MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY" != "1" ]; then
  mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_FUNCTION_B64:?missing MANGABACLAW_TEST_STATE_FUNCTION_B64}"
fi
ONBOARD_FLAGS="${ONBOARD_FLAGS:---flow quickstart --auth-choice skip --skip-channels --skip-skills --skip-daemon --skip-ui}"
if [ -z "${MANGABACLAW_ENTRY:-}" ] && [ "$MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY" != "1" ]; then
  MANGABACLAW_ENTRY="$(mangabaclaw_e2e_resolve_entrypoint)"
fi
export MANGABACLAW_ENTRY
ONBOARD_TMP_ROOT="${MANGABACLAW_ONBOARD_E2E_TMPDIR:-${TMPDIR:-/tmp}}"
ONBOARD_TMP_ROOT="${ONBOARD_TMP_ROOT%/}"
[ -n "$ONBOARD_TMP_ROOT" ] || ONBOARD_TMP_ROOT="/tmp"
mkdir -p "$ONBOARD_TMP_ROOT"
ONBOARD_TMP_DIR="$(mktemp -d "$ONBOARD_TMP_ROOT/mangabaclaw-onboard.XXXXXX")"
MANGABACLAW_E2E_LOG_DIR="$ONBOARD_TMP_DIR/logs"
GATEWAY_LOG_PATH="$ONBOARD_TMP_DIR/gateway-e2e.log"
export MANGABACLAW_E2E_LOG_DIR
export GATEWAY_LOG_PATH
mkdir -p "$MANGABACLAW_E2E_LOG_DIR"
cleanup_onboard_artifacts() {
  mangabaclaw_e2e_stop_process "${GATEWAY_PID:-}"
  mangabaclaw_e2e_stop_process "${mock_openai_pid:-}"
  rm -rf "$ONBOARD_TMP_DIR"
}
if [ "$MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY" != "1" ]; then
  trap cleanup_onboard_artifacts EXIT
fi

# Provide a minimal trash shim to avoid noisy "missing trash" logs in containers.
if [ "$MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY" != "1" ]; then
  mangabaclaw_e2e_install_trash_shim
fi

send() {
  local payload="$1"
  local delay="${2:-0.4}"
  # Let prompts render before sending keystrokes.
  sleep "$delay"
  printf "%b" "$payload" >&3 2>/dev/null || true
}

log_contains() {
  local needle="$1"
  if [ -z "${WIZARD_LOG_PATH:-}" ] || [ ! -f "$WIZARD_LOG_PATH" ]; then
    return 1
  fi
  if grep -a -F -q "$needle" "$WIZARD_LOG_PATH"; then
    return 0
  fi
  node scripts/e2e/lib/onboard/log-contains.mjs "$WIZARD_LOG_PATH" "$needle"
}

wait_for_log() {
  local needle="$1"
  local timeout_s="${2:-45}"
  local quiet_on_timeout="${3:-false}"
  local start_s
  start_s="$(date +%s)"
  while true; do
    if log_contains "$needle"; then
      return 0
    fi
    if [ $(($(date +%s) - start_s)) -ge "$timeout_s" ]; then
      if [ "$quiet_on_timeout" = "true" ]; then
        return 1
      fi
      echo "Timeout waiting for log: $needle"
      if [ -n "${WIZARD_LOG_PATH:-}" ] && [ -f "$WIZARD_LOG_PATH" ]; then
        tail -n 140 "$WIZARD_LOG_PATH" || true
      fi
      return 1
    fi
    sleep 0.2
  done
}

wait_for_skills_prompt_or_ready() {
  local timeout_s="${1:-45}"
  local start_s
  start_s="$(date +%s)"
  while true; do
    if log_contains "Configure skills now?"; then
      return 0
    fi
    if log_contains "All skills ready"; then
      return 2
    fi
    if [ $(($(date +%s) - start_s)) -ge "$timeout_s" ]; then
      echo "Timeout waiting for skills prompt or ready state"
      if [ -n "${WIZARD_LOG_PATH:-}" ] && [ -f "$WIZARD_LOG_PATH" ]; then
        tail -n 140 "$WIZARD_LOG_PATH" || true
      fi
      return 1
    fi
    sleep 0.2
  done
}

start_gateway() {
  GATEWAY_PID="$(mangabaclaw_e2e_start_gateway "$MANGABACLAW_ENTRY" 18789 "$GATEWAY_LOG_PATH")"
}

wait_for_gateway() {
  local wait_attempts
  wait_attempts="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_ONBOARD_GATEWAY_WAIT_ATTEMPTS 20)" || return $?
  local wait_interval_s="${MANGABACLAW_ONBOARD_GATEWAY_WAIT_INTERVAL_S:-1}"
  local saw_listening_log="false"
  for _ in $(seq 1 "$wait_attempts"); do
    if mangabaclaw_e2e_probe_tcp 127.0.0.1 18789 500 >/dev/null 2>&1; then
      return 0
    fi
    if [ -f "$GATEWAY_LOG_PATH" ] && grep -E -q "listening on ws://[^ ]+:18789" "$GATEWAY_LOG_PATH"; then
      saw_listening_log="true"
    fi
    sleep "$wait_interval_s"
  done
  echo "Gateway failed to start"
  if [ "$saw_listening_log" = "true" ]; then
    echo "Gateway log reported listening, but TCP probe never succeeded"
  fi
  cat "$GATEWAY_LOG_PATH" || true
  return 1
}

stop_gateway() {
  mangabaclaw_e2e_stop_process "$1"
}

cleanup_wizard_case() {
  { exec 3>&-; } 2>/dev/null || true
  mangabaclaw_e2e_stop_process "${wizard_pid:-}"
  stop_gateway "${gw_pid:-}"
  rm -rf "${input_fifo_dir:-}"
}

run_wizard_cmd() {
  local case_name="$1"
  local state_ref="$2"
  local command="$3"
  local send_fn="$4"
  local with_gateway="${5:-false}"
  local validate_fn="${6:-}"
  local input_fifo_dir=""
  local input_fifo=""
  local wizard_pid=""
  local gw_pid=""
  local wizard_status=0

  echo "== Wizard case: $case_name =="
  set_isolated_mangabaclaw_env "$state_ref"

  input_fifo_dir="$(mktemp -d "$ONBOARD_TMP_DIR/${case_name}.fifo.XXXXXX")"
  input_fifo="$input_fifo_dir/stdin.fifo"
  if ! mkfifo "$input_fifo"; then
    rm -rf "$input_fifo_dir"
    return 1
  fi
  local log_path="$MANGABACLAW_E2E_LOG_DIR/${case_name}.log"
  WIZARD_LOG_PATH="$log_path"
  export WIZARD_LOG_PATH
  # Run under script to keep an interactive TTY for clack prompts.
  mangabaclaw_e2e_run_script_with_pty "$command" "$log_path" <"$input_fifo" >/dev/null 2>&1 &
  wizard_pid=$!
  if ! exec 3>"$input_fifo"; then
    cleanup_wizard_case
    return 1
  fi

  if [ "$with_gateway" = "true" ]; then
    start_gateway
    gw_pid="$GATEWAY_PID"
    if ! wait_for_gateway; then
      cleanup_wizard_case
      exit 1
    fi
  fi

  "$send_fn" || wizard_status=$?
  if [ "$wizard_status" -ne 0 ]; then
    cleanup_wizard_case
    echo "Wizard input driver exited with status $wizard_status"
    if [ -f "$log_path" ]; then
      tail -n 160 "$log_path" || true
    fi
    exit "$wizard_status"
  fi

  wait "$wizard_pid" || wizard_status=$?
  wizard_pid=""
  if [ "$wizard_status" -ne 0 ]; then
    cleanup_wizard_case
    echo "Wizard exited with status $wizard_status"
    if [ -f "$log_path" ]; then
      tail -n 160 "$log_path" || true
    fi
    exit "$wizard_status"
  fi
  cleanup_wizard_case
  if [ -n "$validate_fn" ]; then
    "$validate_fn" "$log_path"
  fi
}

assert_onboard_config() {
  local scenario="$1"
  shift
  mangabaclaw_e2e_assert_file "$MANGABACLAW_CONFIG_PATH"
  node scripts/e2e/lib/onboard/assert-config.mjs "$scenario" "$MANGABACLAW_CONFIG_PATH" "$@"
}

set_isolated_mangabaclaw_env() {
  local state_ref="$1"
  mangabaclaw_test_state_create "$state_ref" empty
}

send_channels_flow() {
  # Configure channels via configure wizard. Use the remove-config branch for
  # a stable no-op smoke path when the config starts empty.
  # Section-scoped configure flows skip gateway run-mode selection.
  wait_for_log "Channel setup" 120
  send $'\e[B\r' 0.8
  # Keep stdin open until wizard exits.
  send "" 2.0
}

send_skills_flow() {
  # configure --section skills still runs the configure wizard, without the
  # gateway run-mode prompt used by the full wizard.
  if wait_for_skills_prompt_or_ready 120; then
    send $'n\r' 0.8
  else
    local status="$?"
    if [ "$status" -ne 2 ]; then
      return "$status"
    fi
  fi
  send "" 2.0
}

send_guided_skip_ui_flow() {
  wait_for_log "What should we call your first agent?" 120 || return $?
  send $'\r' 0.8
  wait_for_log "How should I set things up?" 120 || return $?
  send $'\r' 0.8
  wait_for_log "Use Current model?" 120 || return $?
  send $'\r' 0.8
}

validate_guided_skip_ui_log() {
  local log_path="$1"
  local mock_request_log="$2"
  log_contains "Hi — I'm MangabaClaw. I keep this system running. Let's get you set up." || {
    echo "Guided onboarding introduction was not rendered"
    return 1
  }
  log_contains "MangabaClaw is ready." || {
    echo "Guided onboarding did not reach its skip-UI completion"
    return 1
  }
  if log_contains "Opening the Control UI dashboard"; then
    echo "Guided skip-UI onboarding attempted a browser handoff"
    return 1
  fi
  if log_contains "Your browser is ready"; then
    echo "Guided skip-UI onboarding completed a browser handoff"
    return 1
  fi
  if log_contains "Hatching your agent now"; then
    echo "Guided skip-UI onboarding attempted a terminal handoff"
    return 1
  fi
  grep -q '"/v1/responses"' "$mock_request_log" || {
    echo "Guided onboarding did not verify the configured model through /v1/responses"
    return 1
  }
}

run_case_guided_skip_ui() {
  local mock_port="19091"
  local mock_log="$ONBOARD_TMP_DIR/guided-skip-ui-mock-openai.log"
  local mock_request_log="$ONBOARD_TMP_DIR/guided-skip-ui-mock-requests.jsonl"
  set_isolated_mangabaclaw_env guided-skip-ui
  export OPENAI_API_KEY="sk-mangabaclaw-guided-skip-ui-e2e"
  node scripts/e2e/lib/onboard/write-config.mjs \
    guided-skip-ui \
    "$MANGABACLAW_CONFIG_PATH" \
    "$MANGABACLAW_TEST_WORKSPACE_DIR" \
    "$mock_port"
  mock_openai_pid="$(
    mangabaclaw_e2e_start_tracked_process \
      "$mock_log" \
      env MOCK_PORT="$mock_port" MOCK_REQUEST_LOG="$mock_request_log" \
      node scripts/e2e/mock-openai-server.mjs
  )"
  mangabaclaw_e2e_wait_mock_openai "$mock_port"

  run_wizard_cmd \
    guided-skip-ui \
    "$HOME" \
    "node \"$MANGABACLAW_ENTRY\" onboard --skip-ui" \
    send_guided_skip_ui_flow

  validate_guided_skip_ui_log "$WIZARD_LOG_PATH" "$mock_request_log"
  echo "QA_ASSERT cli.guided-onboarding pass"
  mangabaclaw_e2e_stop_process "$mock_openai_pid"
  mock_openai_pid=""
}

run_case_local_basic() {
  set_isolated_mangabaclaw_env local-basic
  mangabaclaw_e2e_run_logged local-basic node "$MANGABACLAW_ENTRY" onboard \
    --non-interactive \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --skip-channels \
    --skip-skills \
    --skip-daemon \
    --skip-ui \
    --skip-health

  validate_local_basic_log "$MANGABACLAW_E2E_LAST_LOG_PATH"

  # Assert config + workspace scaffolding.
  workspace_dir="$MANGABACLAW_STATE_DIR/workspace"
  sessions_dir="$MANGABACLAW_STATE_DIR/agents/main/sessions"

  mangabaclaw_e2e_assert_dir "$sessions_dir"
  for file in AGENTS.md BOOTSTRAP.md IDENTITY.md SOUL.md USER.md; do
    mangabaclaw_e2e_assert_file "$workspace_dir/$file"
  done

  assert_onboard_config local-basic "$workspace_dir"

}

run_case_local_auth_refs() {
  set_isolated_mangabaclaw_env local-auth-refs
  export OPENAI_API_KEY="sk-mangabaclaw-onboard-auth-ref-e2e"
  export MANGABACLAW_GATEWAY_TOKEN="mangabaclaw-onboard-gateway-ref-e2e"

  mangabaclaw_e2e_run_logged local-auth-refs node "$MANGABACLAW_ENTRY" onboard \
    --non-interactive \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --auth-choice openai-api-key \
    --secret-input-mode ref \
    --gateway-auth token \
    --gateway-token-ref-env MANGABACLAW_GATEWAY_TOKEN \
    --skip-channels \
    --skip-skills \
    --skip-daemon \
    --skip-ui \
    --skip-health

  node scripts/e2e/lib/release-scenarios/assertions.mjs \
    assert-openai-env-ref \
    "$OPENAI_API_KEY"
  assert_onboard_config local-auth-refs
  echo "QA_ASSERT cli.gateway-auth-storage.token-ref pass"
}

run_case_local_password() {
  set_isolated_mangabaclaw_env local-password

  mangabaclaw_e2e_run_logged local-password node "$MANGABACLAW_ENTRY" onboard \
    --non-interactive \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --auth-choice skip \
    --gateway-auth password \
    --gateway-password "mangabaclaw-onboard-password-e2e" \
    --skip-channels \
    --skip-skills \
    --skip-daemon \
    --skip-ui \
    --skip-health

  assert_onboard_config local-password
  echo "QA_ASSERT cli.gateway-auth-storage.password pass"
}

run_case_multi_agent() {
  set_isolated_mangabaclaw_env multi-agent
  node scripts/e2e/lib/onboard/write-config.mjs multi-agent "$MANGABACLAW_CONFIG_PATH"

  mangabaclaw_e2e_run_logged multi-agent node "$MANGABACLAW_ENTRY" onboard \
    --non-interactive \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --auth-choice skip \
    --skip-channels \
    --skip-skills \
    --skip-daemon \
    --skip-ui \
    --skip-health

  assert_onboard_config multi-agent
  echo "QA_ASSERT cli.multi-agent-onboarding pass"
}

run_case_remote_non_interactive() {
  set_isolated_mangabaclaw_env remote-non-interactive
  # Smoke test non-interactive remote config write.
  mangabaclaw_e2e_run_logged remote-non-interactive node "$MANGABACLAW_ENTRY" onboard --non-interactive --accept-risk \
    --mode remote \
    --remote-url ws://gateway.local:18789 \
    --remote-token remote-token \
    --skip-skills \
    --skip-health

  assert_onboard_config remote-non-interactive
  echo "QA_ASSERT cli.remote-onboarding pass"
}

run_case_reset() {
  set_isolated_mangabaclaw_env reset-config
  node scripts/e2e/lib/onboard/write-config.mjs reset "$MANGABACLAW_CONFIG_PATH"

  mangabaclaw_e2e_run_logged reset-config node "$MANGABACLAW_ENTRY" onboard \
    --non-interactive \
    --accept-risk \
    --flow quickstart \
    --mode local \
    --reset \
    --skip-channels \
    --skip-skills \
    --skip-daemon \
    --skip-ui \
    --skip-health

  assert_onboard_config reset
  echo "QA_ASSERT cli.targeted-reconfiguration.reset pass"
}

run_case_channels() {
  # Channels-only configure flow.
  run_wizard_cmd channels channels "node \"$MANGABACLAW_ENTRY\" configure --section channels" send_channels_flow

  assert_onboard_config channels
}

run_case_skills() {
  local home_dir
  set_isolated_mangabaclaw_env skills
  home_dir="$HOME"
  node scripts/e2e/lib/onboard/write-config.mjs skills "$MANGABACLAW_CONFIG_PATH"

  run_wizard_cmd skills "$home_dir" "node \"$MANGABACLAW_ENTRY\" configure --section skills" send_skills_flow

  assert_onboard_config skills
  echo "QA_ASSERT cli.targeted-reconfiguration.skills pass"
}

validate_local_basic_log() {
  local log_path="$1"
  mangabaclaw_e2e_assert_log_not_contains "$log_path" "systemctl --user unavailable"
}

run_selected_cases() {
  local selected_cases="${MANGABACLAW_ONBOARD_E2E_CASES:-guided-skip-ui,local-basic,multi-agent,remote-non-interactive,reset,channels,skills}"
  local case_name
  local -a cases=()
  IFS="," read -r -a cases <<<"$selected_cases"
  for case_name in "${cases[@]}"; do
    case "$case_name" in
      guided-skip-ui) run_case_guided_skip_ui ;;
      local-basic) run_case_local_basic ;;
      local-auth-refs) run_case_local_auth_refs ;;
      local-password) run_case_local_password ;;
      multi-agent) run_case_multi_agent ;;
      remote-non-interactive) run_case_remote_non_interactive ;;
      reset) run_case_reset ;;
      channels) run_case_channels ;;
      skills) run_case_skills ;;
      *)
        echo "Unknown onboarding E2E case: $case_name" >&2
        return 2
        ;;
    esac
  done
}

if [ "$MANGABACLAW_ONBOARD_SCENARIO_SOURCE_ONLY" != "1" ]; then
  run_selected_cases
fi
