#!/usr/bin/env bash
set -euo pipefail

source scripts/lib/mangabaclaw-e2e-instance.sh

mangabaclaw_e2e_eval_test_state_from_b64 "${MANGABACLAW_TEST_STATE_SCRIPT_B64:?missing MANGABACLAW_TEST_STATE_SCRIPT_B64}"
mangabaclaw_e2e_install_package /tmp/mangabaclaw-install.log "mounted MangabaClaw package" /tmp/npm-prefix

package_root="$(mangabaclaw_e2e_package_root /tmp/npm-prefix)"
entry="$(mangabaclaw_e2e_package_entrypoint "$package_root")"
probe="scripts/e2e/lib/plugin-update/probe.mjs"
package_version="$(node -p "require('$package_root/package.json').version")"
MANGABACLAW_PACKAGE_ACCEPTANCE_LEGACY_COMPAT="$(node "$probe" legacy-compat "$package_version")"
export MANGABACLAW_PACKAGE_ACCEPTANCE_LEGACY_COMPAT
export PATH="/tmp/npm-prefix/bin:$PATH"

node "$probe" seed

registry_port_file=/tmp/mangabaclaw-e2e-registry.port
rm -f "$registry_port_file"
node scripts/e2e/lib/plugin-update/registry-server.mjs "$registry_port_file" >/tmp/mangabaclaw-e2e-registry.log 2>&1 &
registry_pid=$!
trap 'mangabaclaw_e2e_stop_process "${registry_pid:-}"' EXIT
for _ in $(seq 1 50); do
  if [ -s "$registry_port_file" ]; then
    break
  fi
  sleep 0.1
done
if [ ! -s "$registry_port_file" ]; then
  echo "Local npm metadata registry did not expose a port"
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-e2e-registry.log
  exit 1
fi
export NPM_CONFIG_REGISTRY="http://127.0.0.1:$(cat "$registry_port_file")"
export npm_config_registry="$NPM_CONFIG_REGISTRY"

if ! node "$probe" wait-registry; then
  echo "Local npm metadata registry failed to start"
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-e2e-registry.log
  exit 1
fi

before_config_hash=""
if [ "$MANGABACLAW_PACKAGE_ACCEPTANCE_LEGACY_COMPAT" != "1" ]; then
  before_config_hash="$(sha256sum "$MANGABACLAW_CONFIG_PATH" | awk '{print $1}')"
fi
plugin_update_timeout_seconds="$(mangabaclaw_e2e_read_positive_int_env MANGABACLAW_PLUGIN_UPDATE_TIMEOUT_SECONDS 180)"

node "$probe" snapshot > /tmp/plugin-update-before.json

set +e
mangabaclaw_e2e_maybe_timeout "${plugin_update_timeout_seconds}s" node "$entry" plugins update @example/lossless-claw > /tmp/plugin-update-output.log 2>&1
plugin_update_status=$?
set -e
if [ "$plugin_update_status" -ne 0 ]; then
  echo "Plugin update command failed or timed out after ${plugin_update_timeout_seconds}s (status ${plugin_update_status})"
  echo "--- plugin update output ---"
  mangabaclaw_e2e_print_log /tmp/plugin-update-output.log
  echo "--- local registry output ---"
  mangabaclaw_e2e_print_log /tmp/mangabaclaw-e2e-registry.log
  exit "$plugin_update_status"
fi

if [ -n "$before_config_hash" ]; then
  after_config_hash="$(sha256sum "$MANGABACLAW_CONFIG_PATH" | awk '{print $1}')"
  if [ "$before_config_hash" != "$after_config_hash" ]; then
    echo "Config changed unexpectedly for modern package $package_version"
    mangabaclaw_e2e_print_log /tmp/plugin-update-output.log
    exit 1
  fi
fi

node "$probe" assert-snapshot /tmp/plugin-update-before.json
node "$probe" assert-output /tmp/plugin-update-output.log
mangabaclaw_e2e_print_log /tmp/plugin-update-output.log
