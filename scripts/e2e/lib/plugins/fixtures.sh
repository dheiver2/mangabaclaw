MANGABACLAW_PLUGINS_FIXTURE_PID_FILES=()
MANGABACLAW_PLUGINS_FIXTURE_EXIT_TRAP_INSTALLED=0
MANGABACLAW_PLUGINS_FIXTURE_PREVIOUS_EXIT_ACTION=""

mangabaclaw_plugins_read_positive_int_env() {
  local name="${1:?missing environment variable name}"
  local fallback="${2:?missing fallback value}"
  local value="${!name-}"
  if [[ -z "${!name+x}" ]]; then
    value="$fallback"
  fi
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( 10#$value < 1 )); then
    echo "invalid $name: $value" >&2
    return 2
  fi
  printf "%s\n" "$((10#$value))"
}

mangabaclaw_plugins_read_nonnegative_decimal_env() {
  local name="${1:?missing environment variable name}"
  local fallback="${2:?missing fallback value}"
  local value="${!name-}"
  if [[ -z "${!name+x}" ]]; then
    value="$fallback"
  fi
  if [[ ! "$value" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "invalid $name: $value" >&2
    return 2
  fi
  printf "%s\n" "$value"
}

mangabaclaw_plugins_cleanup_fixture_servers() {
  local pid_file
  local pid
  for pid_file in "${MANGABACLAW_PLUGINS_FIXTURE_PID_FILES[@]:-}"; do
    [[ -f "$pid_file" ]] || continue
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
      mangabaclaw_plugins_stop_fixture_process "$pid"
    fi
    rm -f "$pid_file"
  done
}

mangabaclaw_plugins_signal_fixture_process() {
  local pid="$1"
  local signal="$2"
  if kill -0 -- "-$pid" >/dev/null 2>&1; then
    kill "-$signal" -- "-$pid" >/dev/null 2>&1 || true
    return
  fi
  kill "-$signal" "$pid" >/dev/null 2>&1 || true
}

mangabaclaw_plugins_fixture_process_alive() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1 || kill -0 -- "-$pid" >/dev/null 2>&1
}

mangabaclaw_plugins_stop_fixture_process() {
  local pid="$1"
  local _
  local attempts interval
  attempts="$(mangabaclaw_plugins_read_positive_int_env MANGABACLAW_PLUGINS_FIXTURE_STOP_ATTEMPTS 40)" || return $?
  interval="$(mangabaclaw_plugins_read_nonnegative_decimal_env MANGABACLAW_PLUGINS_FIXTURE_STOP_INTERVAL_SECONDS 0.25)" || return $?
  if declare -F mangabaclaw_e2e_stop_process >/dev/null 2>&1; then
    mangabaclaw_e2e_stop_process "$pid"
    return
  fi
  mangabaclaw_plugins_signal_fixture_process "$pid" TERM
  for _ in $(seq 1 "$attempts"); do
    ! mangabaclaw_plugins_fixture_process_alive "$pid" && { wait "$pid" >/dev/null 2>&1 || true; return; }
    sleep "$interval"
  done
  mangabaclaw_plugins_signal_fixture_process "$pid" KILL
  wait "$pid" >/dev/null 2>&1 || true
}

mangabaclaw_plugins_print_fixture_log() {
  local log_file="$1"
  if declare -F docker_e2e_print_log >/dev/null 2>&1; then
    docker_e2e_print_log "$log_file"
    return
  fi
  if [ ! -f "$log_file" ]; then
    return
  fi

  local max_bytes
  max_bytes="$(mangabaclaw_plugins_read_positive_int_env MANGABACLAW_DOCKER_E2E_LOG_PRINT_BYTES 65536)" || return $?

  local log_bytes
  log_bytes="$(wc -c <"$log_file" 2>/dev/null || echo 0)"
  log_bytes="${log_bytes//[[:space:]]/}"
  if ! [[ "$log_bytes" =~ ^[0-9]+$ ]]; then
    log_bytes="0"
  fi
  if [ "$log_bytes" -le "$max_bytes" ]; then
    cat "$log_file"
    return
  fi
  echo "--- ${log_file} truncated: showing last ${max_bytes} of ${log_bytes} bytes ---"
  tail -c "$max_bytes" "$log_file"
}

mangabaclaw_plugins_validate_fixture_log_print_bytes() {
  mangabaclaw_plugins_read_positive_int_env MANGABACLAW_DOCKER_E2E_LOG_PRINT_BYTES 65536 >/dev/null
}

mangabaclaw_plugins_register_fixture_pid_file() {
  local pid_file="$1"
  MANGABACLAW_PLUGINS_FIXTURE_PID_FILES+=("$pid_file")
  mangabaclaw_plugins_install_fixture_cleanup_trap
}

mangabaclaw_plugins_install_fixture_cleanup_trap() {
  if [[ "${MANGABACLAW_PLUGINS_FIXTURE_EXIT_TRAP_INSTALLED:-0}" = "1" ]]; then
    return
  fi

  local existing_trap
  existing_trap="$(trap -p EXIT || true)"
  if [[ -n "$existing_trap" && "$existing_trap" != *mangabaclaw_plugins_fixture_exit_trap* ]]; then
    local existing_action="${existing_trap#trap -- }"
    existing_action="${existing_action% EXIT}"
    eval "MANGABACLAW_PLUGINS_FIXTURE_PREVIOUS_EXIT_ACTION=$existing_action"
  fi

  MANGABACLAW_PLUGINS_FIXTURE_EXIT_TRAP_INSTALLED=1
  trap mangabaclaw_plugins_fixture_exit_trap EXIT
}

mangabaclaw_plugins_fixture_exit_trap() {
  local status="$?"
  mangabaclaw_plugins_cleanup_fixture_servers
  if [[ -n "${MANGABACLAW_PLUGINS_FIXTURE_PREVIOUS_EXIT_ACTION:-}" ]]; then
    eval "$MANGABACLAW_PLUGINS_FIXTURE_PREVIOUS_EXIT_ACTION"
  fi
  exit "$status"
}

record_fixture_plugin_trust() {
  local plugin_id="$1"
  local plugin_root="$2"
  local enabled="$3"
  node scripts/e2e/lib/plugins/assertions.mjs record-fixture-plugin-trust "$plugin_id" "$plugin_root" "$enabled"
}

write_demo_fixture_plugin() {
  local dir="$1"
  node scripts/e2e/lib/fixture.mjs plugin-demo "$dir"
}

write_fixture_plugin() {
  local dir="$1"
  local id="$2"
  local version="$3"
  local method="$4"
  local name="$5"

  node scripts/e2e/lib/fixture.mjs plugin "$dir" "$id" "$version" "$method" "$name"
}

write_fixture_plugin_with_cli() {
  local dir="$1"
  local id="$2"
  local version="$3"
  local method="$4"
  local name="$5"
  local cli_root="$6"
  local cli_output="$7"

  node scripts/e2e/lib/fixture.mjs plugin-cli "$dir" "$id" "$version" "$method" "$name" "$cli_root" "$cli_output"
}

pack_fixture_plugin_with_cli_registry_dependency() {
  local pack_dir="$1"
  local output_tgz="$2"
  local id="$3"
  local version="$4"
  local method="$5"
  local name="$6"
  local cli_root="$7"
  local cli_output="$8"

  mkdir -p "$pack_dir/package"
  node scripts/e2e/lib/fixture.mjs plugin-cli-registry-dep "$pack_dir/package" "$id" "$version" "$method" "$name" "$cli_root" "$cli_output"
  tar -czf "$output_tgz" -C "$pack_dir" package
}

pack_fake_is_number_package() {
  local pack_dir="$1"
  local output_tgz="$2"

  mkdir -p "$pack_dir/package"
  node scripts/e2e/lib/fixture.mjs fake-is-number-package "$pack_dir/package"
  tar -czf "$output_tgz" -C "$pack_dir" package
}

write_fixture_plugin_with_vendored_dependency() {
  local dir="$1"
  local id="$2"
  local version="$3"
  local method="$4"
  local name="$5"

  node scripts/e2e/lib/fixture.mjs plugin-vendored-dep "$dir" "$id" "$version" "$method" "$name"
}

pack_fixture_plugin() {
  local pack_dir="$1"
  local output_tgz="$2"
  local id="$3"
  local version="$4"
  local method="$5"
  local name="$6"

  mkdir -p "$pack_dir/package"
  write_fixture_plugin "$pack_dir/package" "$id" "$version" "$method" "$name"
  tar -czf "$output_tgz" -C "$pack_dir" package
}

pack_fixture_plugin_with_invalid_extension_entry() {
  local pack_dir="$1"
  local output_tgz="$2"
  local id="$3"
  local version="$4"
  local method="$5"
  local name="$6"

  mkdir -p "$pack_dir/package"
  write_fixture_plugin "$pack_dir/package" "$id" "$version" "$method" "$name"
  node --input-type=module - "$pack_dir/package/package.json" <<'NODE'
import fs from "node:fs";

const packageJsonPath = process.argv[2];
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.mangabaclaw.extensions = ["./index.js", " "];
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
NODE
  tar -czf "$output_tgz" -C "$pack_dir" package
}

start_npm_fixture_registry() {
  local package_name="$1"
  local version="$2"
  local tarball="$3"
  local fixture_dir="$4"
  local server_log="$fixture_dir/npm-registry.log"
  local server_port_file="$fixture_dir/npm-registry-port"
  local server_pid_file="$fixture_dir/npm-registry-pid"

  shift 4

  mangabaclaw_plugins_validate_fixture_log_print_bytes || return $?

  node scripts/e2e/lib/plugins/npm-registry-server.mjs "$server_port_file" "$package_name" "$version" "$tarball" "$@" >"$server_log" 2>&1 &
  local server_pid="$!"
  echo "$server_pid" >"$server_pid_file"
  mangabaclaw_plugins_register_fixture_pid_file "$server_pid_file"

  for _ in $(seq 1 100); do
    if [[ -s "$server_port_file" ]]; then
      export NPM_CONFIG_REGISTRY="http://127.0.0.1:$(cat "$server_port_file")"
      return 0
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      mangabaclaw_plugins_print_fixture_log "$server_log"
      return 1
    fi
    sleep 0.1
  done

  mangabaclaw_plugins_print_fixture_log "$server_log"
  echo "Timed out waiting for npm fixture registry." >&2
  return 1
}

write_claude_bundle_fixture() {
  local bundle_root="$1"

  node scripts/e2e/lib/fixture.mjs claude-bundle "$bundle_root"
}
