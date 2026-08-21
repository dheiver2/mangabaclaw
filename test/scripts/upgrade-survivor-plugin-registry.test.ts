import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const SCRIPT = resolve("scripts/e2e/upgrade-survivor-docker.sh");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function runSurvivor(overrides: NodeJS.ProcessEnv = {}) {
  const root = tempDirs.make("mangabaclaw-upgrade-survivor-registry-");
  const binDir = join(root, "bin");
  const captureDir = join(root, "capture");
  const packageTarball = join(root, "mangabaclaw-current.tgz");
  mkdirSync(binDir);
  mkdirSync(captureDir);
  writeFileSync(packageTarball, "candidate");
  writeExecutable(
    join(binDir, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" != */scripts/test-docker-all.mjs ]] || [ "\${2:-}" != "--prepare-plugin-registry" ]; then
  exec "$REAL_NODE" "$@"
fi
printf '%s\n' "$*" >>"$CAPTURE_DIR/node-args"
printf '%s|%s|%s\n' \
  "$MANGABACLAW_DOCKER_ALL_LANES" \
  "$MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPECS" \
  "$MANGABACLAW_UPGRADE_SURVIVOR_SCENARIOS" >>"$CAPTURE_DIR/node-env"
mkdir -p "$MANGABACLAW_DOCKER_ALL_LOG_DIR/prepublish-plugin-registry"
printf '{"packages":[]}\n' \
  >"$MANGABACLAW_DOCKER_ALL_LOG_DIR/prepublish-plugin-registry/prepublish-plugin-registry.json"
printf '{"dir":"%s"}\n' "$MANGABACLAW_DOCKER_ALL_LOG_DIR/prepublish-plugin-registry"
`,
  );
  writeExecutable(
    join(binDir, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$CAPTURE_DIR/docker-args"
previous=""
for arg in "$@"; do
  if [ "$previous" = "--cidfile" ]; then
    printf 'fake-container\n' >"$arg"
  fi
  previous="$arg"
done
`,
  );

  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      CAPTURE_DIR: captureDir,
      REAL_NODE: process.execPath,
      MANGABACLAW_CURRENT_PACKAGE_TGZ: packageTarball,
      MANGABACLAW_DOCKER_E2E_DISABLE_RESOURCE_LIMITS: "1",
      MANGABACLAW_SKIP_CHANNELS: "1",
      MANGABACLAW_SKIP_PROVIDERS: "1",
      MANGABACLAW_UPGRADE_SURVIVOR_ARTIFACT_DIR: join(root, "artifacts"),
      MANGABACLAW_UPGRADE_SURVIVOR_BASELINE_SPEC: "mangabaclaw@2026.7.1-2",
      MANGABACLAW_UPGRADE_SURVIVOR_E2E_SKIP_BUILD: "1",
      MANGABACLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE: "1",
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      TMPDIR: root,
      ...overrides,
    },
    timeout: 30_000,
  });
  return { captureDir, packageTarball, result, root };
}

describe("standalone upgrade survivor plugin registry", () => {
  it("prepares and mounts a planner-owned registry for the current candidate", () => {
    const { captureDir, result } = runSurvivor({
      MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO: "configured-plugin-installs",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(captureDir, "node-args"), "utf8")).toContain(
      "scripts/test-docker-all.mjs --prepare-plugin-registry",
    );
    expect(readFileSync(join(captureDir, "node-env"), "utf8")).toBe(
      "published-upgrade-survivor|mangabaclaw@2026.7.1-2|configured-plugin-installs\n",
    );
    expect(readFileSync(join(captureDir, "docker-args"), "utf8")).toContain(
      ":/tmp/mangabaclaw-prepublish-plugin-registry:ro",
    );
  });

  it("preserves an explicitly supplied registry without preparing another", () => {
    const registryDir = tempDirs.make("mangabaclaw-external-plugin-registry-");
    writeFileSync(join(registryDir, "prepublish-plugin-registry.json"), '{"external":true}\n');

    const { captureDir, result } = runSurvivor({
      MANGABACLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR: registryDir,
      MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO: "external-only-scenario",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(captureDir, "node-args"))).toBe(false);
    expect(readFileSync(join(captureDir, "docker-args"), "utf8")).toContain(
      `${registryDir}:/tmp/mangabaclaw-prepublish-plugin-registry:ro`,
    );
  });

  it("does not prepare a registry for a published candidate", () => {
    const { captureDir, packageTarball, result } = runSurvivor({
      MANGABACLAW_CURRENT_PACKAGE_TGZ: undefined,
      MANGABACLAW_UPGRADE_SURVIVOR_CANDIDATE: "mangabaclaw@2026.8.1",
      MANGABACLAW_UPGRADE_SURVIVOR_SCENARIO: "published-only-scenario",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(captureDir, "node-args"))).toBe(false);
    expect(readFileSync(join(captureDir, "docker-args"), "utf8")).not.toContain(
      "/tmp/mangabaclaw-prepublish-plugin-registry",
    );
    expect(existsSync(packageTarball)).toBe(true);
  });
});

describe("standalone upgrade survivor live OpenAI probe", () => {
  it("fails closed before Docker when the opted-in key is missing", () => {
    const { captureDir, result } = runSurvivor({
      OPENAI_API_KEY: undefined,
      MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI: "1",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI=1 requires OPENAI_API_KEY",
    );
    expect(existsSync(join(captureDir, "docker-args"))).toBe(false);
  });

  it("forwards the opted-in key by environment name without putting it in Docker arguments", () => {
    const key = "live-openai-key-must-not-appear-in-arguments";
    const { captureDir, result } = runSurvivor({
      OPENAI_API_KEY: key,
      MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI: "1",
      MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_MODEL: "openai/test-model",
    });

    expect(result.status, result.stderr).toBe(0);
    const args = readFileSync(join(captureDir, "docker-args"), "utf8");
    expect(args).toContain("-e OPENAI_API_KEY");
    expect(args).toContain("-e MANGABACLAW_UPGRADE_SURVIVOR_LIVE_OPENAI_MODEL=openai/test-model");
    expect(args).not.toContain(key);
  });
});
