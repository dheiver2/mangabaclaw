#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-e2e-package.sh"

read_positive_int_env() {
  local name="${1:?missing environment variable name}"
  local fallback="${2:?missing fallback value}"
  local value="${!name-}"
  if [ -z "${!name+x}" ]; then
    value="$fallback"
  fi
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( 10#$value < 1 )); then
    echo "invalid $name: $value" >&2
    return 2
  fi
  printf "%s\n" "$((10#$value))"
}

BUN_BIN="${BUN_BIN:-bun}"
HOST_BUILD="${MANGABACLAW_BUN_GLOBAL_SMOKE_HOST_BUILD:-1}"
DIST_IMAGE="${MANGABACLAW_BUN_GLOBAL_SMOKE_DIST_IMAGE:-}"
PACKAGE_TGZ="${MANGABACLAW_BUN_GLOBAL_SMOKE_PACKAGE_TGZ:-}"
COMMAND_TIMEOUT_MS="$(read_positive_int_env MANGABACLAW_BUN_GLOBAL_SMOKE_TIMEOUT_MS 180000)"
DOCKER_COMMAND_TIMEOUT="${DOCKER_COMMAND_TIMEOUT:-${MANGABACLAW_BUN_GLOBAL_SMOKE_DOCKER_COMMAND_TIMEOUT:-600s}}"
AI_PACKAGE_TGZ=""
SMOKE_DIR=""
PACK_DIR=""

cleanup() {
  if [ -n "${SMOKE_DIR:-}" ]; then
    rm -rf "$SMOKE_DIR"
  fi
  if [ -n "${PACK_DIR:-}" ]; then
    rm -rf "$PACK_DIR"
  fi
}

prepare_ai_candidate() {
  local ai_manifest
  local ai_package_dir
  local ai_tarballs
  local root_manifest

  if [ -z "$PACK_DIR" ]; then
    PACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mangabaclaw-bun-pack.XXXXXX")"
  fi
  echo "==> Extract bundled candidate @mangabaclaw/ai package"
  ai_package_dir="$PACK_DIR/ai-candidate"
  mkdir -p "$ai_package_dir"
  tar -xzf "$PACKAGE_TGZ" \
    -C "$ai_package_dir" \
    --strip-components=4 \
    package/node_modules/@mangabaclaw/ai
  root_manifest="$PACK_DIR/mangabaclaw-package.json"
  ai_manifest="$ai_package_dir/package.json"
  tar -xOf "$PACKAGE_TGZ" package/package.json >"$root_manifest"
  node scripts/e2e/lib/bun-global-install/assertions.mjs \
    assert-release-versions \
    "$root_manifest" \
    "$ai_manifest" \
    >/dev/null
  npm pack --ignore-scripts --silent --pack-destination "$PACK_DIR" "$ai_package_dir" >/dev/null
  ai_tarballs=("$PACK_DIR"/mangabaclaw-ai-*.tgz)
  if [ "${#ai_tarballs[@]}" -ne 1 ] || [ ! -f "${ai_tarballs[0]}" ]; then
    echo "expected one packed @mangabaclaw/ai candidate in $PACK_DIR" >&2
    exit 1
  fi
  AI_PACKAGE_TGZ="${ai_tarballs[0]}"
}

trap cleanup EXIT

run_with_timeout() {
  local timeout_ms="$1"
  shift
  node scripts/e2e/lib/bun-global-install/assertions.mjs run-with-timeout "$timeout_ms" "$@"
}

resolve_package_tgz() {
  local -a package_args
  if [ -n "$PACKAGE_TGZ" ]; then
    if [ ! -f "$PACKAGE_TGZ" ]; then
      echo "MANGABACLAW_BUN_GLOBAL_SMOKE_PACKAGE_TGZ does not exist: $PACKAGE_TGZ" >&2
      exit 1
    fi
    PACKAGE_TGZ="$(cd "$(dirname "$PACKAGE_TGZ")" && pwd)/$(basename "$PACKAGE_TGZ")"
    return 0
  fi

  if [ -n "$DIST_IMAGE" ]; then
    docker_e2e_restore_package_dist_from_image "$DIST_IMAGE"
  elif [ "$HOST_BUILD" != "0" ]; then
    echo "==> Build host package artifacts"
    pnpm build
  else
    echo "==> Skipping host build (MANGABACLAW_BUN_GLOBAL_SMOKE_HOST_BUILD=0)"
  fi

  if [ ! -d "$ROOT_DIR/dist" ]; then
    echo "dist/ is missing; run pnpm build or set MANGABACLAW_BUN_GLOBAL_SMOKE_DIST_IMAGE" >&2
    exit 1
  fi

  PACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mangabaclaw-bun-pack.XXXXXX")"

  echo "==> Pack MangabaClaw tarball"
  package_args=(
    --skip-build
    --output-dir "$PACK_DIR"
    --output-name mangabaclaw-current.tgz
  )
  if [[ "${MANGABACLAW_BUN_GLOBAL_SMOKE_ALLOW_UNRELEASED_CHANGELOG:-true}" == "true" ]]; then
    package_args+=(--allow-unreleased-changelog)
  fi
  PACKAGE_TGZ="$(
    node scripts/package-mangabaclaw-for-docker.mjs "${package_args[@]}"
  )"
  if [ -z "$PACKAGE_TGZ" ] || [ ! -f "$PACKAGE_TGZ" ]; then
    echo "missing packed MangabaClaw tarball" >&2
    exit 1
  fi
}

main() {
  cd "$ROOT_DIR"

  if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
    echo "Bun is required for bun global install smoke; set BUN_BIN or install bun." >&2
    exit 1
  fi

  resolve_package_tgz
  prepare_ai_candidate

  local bun_path
  local mangabaclaw_bin
  bun_path="$(command -v "$BUN_BIN")"
  SMOKE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mangabaclaw-bun-global.XXXXXX")"

  export HOME="$SMOKE_DIR/home"
  export BUN_INSTALL="$HOME/.bun"
  export XDG_CACHE_HOME="$SMOKE_DIR/cache"
  export MANGABACLAW_NO_ONBOARD=1
  export MANGABACLAW_DISABLE_UPDATE_CHECK=1
  export NO_COLOR=1
  mkdir -p "$HOME" "$BUN_INSTALL/bin" "$BUN_INSTALL/install/global" "$XDG_CACHE_HOME"
  export PATH="$BUN_INSTALL/bin:$(dirname "$(command -v node)"):$PATH"
  # Release publishes @mangabaclaw/ai first. Bun 1.3.14 ignores bundled deps in
  # local tarballs, so resolve that one package from the exact candidate bytes.
  node --input-type=module - \
    "$BUN_INSTALL/install/global/package.json" \
    "$AI_PACKAGE_TGZ" <<'NODE'
import fs from "node:fs";

const [, , packageJsonPath, aiPackageTarball] = process.argv;
fs.writeFileSync(
  packageJsonPath,
  `${JSON.stringify({ private: true, overrides: { "@mangabaclaw/ai": `file:${aiPackageTarball}` } })}\n`,
);
NODE

  echo "==> Bun version"
  "$bun_path" --version

  echo "==> Bun global install packed MangabaClaw"
  "$bun_path" install -g "$PACKAGE_TGZ" --no-progress

  mangabaclaw_bin="$BUN_INSTALL/bin/mangabaclaw"
  if [ ! -x "$mangabaclaw_bin" ]; then
    mangabaclaw_bin="$(command -v mangabaclaw || true)"
  fi
  if [ -z "$mangabaclaw_bin" ] || [ ! -x "$mangabaclaw_bin" ]; then
    echo "Bun global install did not create an executable mangabaclaw binary" >&2
    exit 1
  fi

  echo "==> MangabaClaw version through Bun global install"
  local mangabaclaw_version
  mangabaclaw_version="$(run_with_timeout "$COMMAND_TIMEOUT_MS" "$mangabaclaw_bin" --version)"
  printf "%s\n" "$mangabaclaw_version"

  echo "==> MangabaClaw help through Bun global install"
  run_with_timeout "$COMMAND_TIMEOUT_MS" "$mangabaclaw_bin" --help >/dev/null

  echo "==> MangabaClaw image providers through Bun global install"
  local providers_json
  providers_json="$(run_with_timeout "$COMMAND_TIMEOUT_MS" "$mangabaclaw_bin" infer image providers --json)"
  MANGABACLAW_IMAGE_PROVIDERS_JSON="$providers_json" node scripts/e2e/lib/bun-global-install/assertions.mjs assert-image-providers

  if [ -n "${MANGABACLAW_BUN_GLOBAL_SMOKE_PROOF_PATH:-}" ]; then
    node --input-type=module - \
      "$MANGABACLAW_BUN_GLOBAL_SMOKE_PROOF_PATH" \
      "$bun_path" \
      "$mangabaclaw_bin" \
      "$mangabaclaw_version" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [, , proofPath, bunPath, mangabaclawPath, mangabaclawVersion] = process.argv;
fs.mkdirSync(path.dirname(proofPath), { recursive: true });
fs.writeFileSync(
  proofPath,
  `${JSON.stringify({ bunPath, mangabaclawPath, mangabaclawVersion }, null, 2)}\n`,
);
NODE
  fi
}

main "$@"
