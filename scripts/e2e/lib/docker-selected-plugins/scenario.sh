#!/usr/bin/env bash
set -euo pipefail

export HOME=/tmp/mangabaclaw-docker-selected-plugins
export MANGABACLAW_STATE_DIR="$HOME/.mangabaclaw"
export MANGABACLAW_CONFIG_PATH="$MANGABACLAW_STATE_DIR/mangabaclaw.json"
export MANGABACLAW_DISABLE_BUNDLED_SOURCE_OVERLAYS=1

mkdir -p "$MANGABACLAW_STATE_DIR"
node --input-type=module <<'NODE'
import fs from "node:fs";

const entries = Object.fromEntries(
  ["clickclack", "slack", "msteams"].map((id) => [id, { enabled: true }]),
);
fs.writeFileSync(
  process.env.MANGABACLAW_CONFIG_PATH,
  `${JSON.stringify({ plugins: { entries } }, null, 2)}\n`,
  { mode: 0o600 },
);
NODE

for plugin_id in clickclack slack msteams clawrouter; do
  node /app/mangabaclaw.mjs plugins inspect "$plugin_id" --runtime --json \
    >"/tmp/mangabaclaw-${plugin_id}-inspect.json"
done

node /mangabaclaw-e2e/assertions.mjs
