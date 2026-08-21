#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <device-udid> <bundle-id> [dest]" >&2
  echo "       MANGABACLAW_IOS_DEVICE_UDID=... MANGABACLAW_IOS_BUNDLE_ID=... $0" >&2
}

DEVICE_UDID="${1:-${MANGABACLAW_IOS_DEVICE_UDID:-}}"
BUNDLE_ID="${2:-${MANGABACLAW_IOS_BUNDLE_ID:-}}"
DEST="${3:-${MANGABACLAW_IOS_GATEWAY_LOG_DEST:-}}"

if [[ -z "$DEVICE_UDID" || -z "$BUNDLE_ID" ]]; then
  usage
  exit 2
fi

if [[ -z "$DEST" ]]; then
  dest_dir="$(mktemp -d "${TMPDIR:-/tmp}/mangabaclaw-ios-gateway.XXXXXX")"
  DEST="$dest_dir/mangabaclaw-gateway.log"
fi

xcrun devicectl device copy from \
  --device "$DEVICE_UDID" \
  --domain-type appDataContainer \
  --domain-identifier "$BUNDLE_ID" \
  --source Documents/mangabaclaw-gateway.log \
  --destination "$DEST" >/dev/null

if [[ ! -s "$DEST" ]]; then
  echo "Gateway log pull produced an empty file: $DEST" >&2
  exit 1
fi

echo "Pulled to: $DEST"
tail -n 200 "$DEST"
