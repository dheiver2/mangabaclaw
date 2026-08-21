// Website Installer Sync Workflow tests cover website installer sync workflow script behavior.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { detectInstallSmokeScope } = await import("../../scripts/ci-changed-scope.mjs");

const WORKFLOW_PATH = ".github/workflows/website-installer-sync.yml";

describe("website installer sync workflow", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("treats all website installer scripts as MangabaClaw-owned inputs", () => {
    for (const path of ["scripts/install.sh", "scripts/install-cli.sh", "scripts/install.ps1"]) {
      expect(workflow).toContain(path);
      expect(detectInstallSmokeScope([path]).runFullInstallSmoke).toBe(true);
    }
  });

  it("verifies installers across Linux privilege and package-manager paths", () => {
    expect(workflow).toContain("linux-docker:");
    expect(workflow.match(/timeout --kill-after=30s 20m docker run --rm/g)?.length).toBe(5);
    expect(workflow).toContain("linux-build-tools-failure:");
    expect(workflow).toContain("/tmp/build-tools-stub-triggered");
    expect(workflow).toContain('grep -aFq "Installing build tools failed"');
    expect(workflow).toContain('grep -aFq "Build tools installed"');
    expect(workflow).toContain("linux-non-root:");
    expect(workflow).toContain("sudo -u installer -H bash");
    expect(workflow).toContain('test "$(npm config get prefix)" = "$HOME/.npm-global"');
    expect(workflow).toContain(
      `grep -Fxq 'export PATH="$HOME/.npm-global/bin:$PATH"' "$HOME/.bashrc"`,
    );
    expect(workflow).toContain("fedora-installer:");
    expect(workflow).toContain("user: [root, non-root]");
    expect(workflow.match(/fedora:44/g)?.length).toBe(2);
    expect(workflow).not.toContain("timeout 20m docker run --rm");
    expect(workflow).not.toMatch(/(^|\n)\s+docker run --rm/u);
    expect(workflow).toContain("bash /tmp/install.sh --version latest && mangabaclaw --version");
    expect(workflow).not.toContain("bash /tmp/install.sh --no-prompt --no-onboard");
    expect(workflow).toContain("bash /tmp/install-cli.sh --prefix /tmp/mangabaclaw");
    expect(workflow).toContain("macos-installer:");
    expect(workflow).toContain("runs-on: macos-15");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain('MANGABACLAW_NO_ONBOARD: "1"');
    expect(workflow).toContain('MANGABACLAW_NO_PROMPT: "1"');
    expect(workflow).toContain("bash scripts/install.sh --no-onboard --no-prompt --version latest");
    expect(workflow).toContain("mangabaclaw --version");
    expect(workflow).toContain("windows-installer:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain(".\\scripts\\install.ps1 -DryRun");
    expect(workflow).not.toContain("install.cmd dry run");
    expect(workflow).not.toContain(".\\scripts\\install.cmd");
  });

  it("syncs verified scripts to mangabaclaw.ai only after all installer checks pass", () => {
    const syncNeeds = workflow.match(/  sync-website:\n    needs:\n((?:      - [^\n]+\n)+)/u);
    expect(syncNeeds?.[1]).toBe(
      [
        "static",
        "linux-docker",
        "linux-build-tools-failure",
        "linux-non-root",
        "fedora-installer",
        "macos-installer",
        "windows-installer",
      ]
        .map((job) => `      - ${job}\n`)
        .join(""),
    );
    expect(workflow).toContain("repository: mangabaclaw/mangabaclaw.ai");
    expect(workflow).toContain("MANGABACLAW_GH_TOKEN: ${{ secrets.MANGABACLAW_GH_TOKEN }}");
    expect(workflow).toContain("MANGABACLAW_GH_TOKEN is not configured");
    expect(workflow).toContain("token: ${{ env.MANGABACLAW_GH_TOKEN }}");
    expect(workflow).toContain("cp mangabaclaw/scripts/install.sh mangabaclaw.ai/public/install.sh");
    expect(workflow).toContain(
      "cp mangabaclaw/scripts/install-cli.sh mangabaclaw.ai/public/install-cli.sh",
    );
    expect(workflow).toContain("cp mangabaclaw/scripts/install.ps1 mangabaclaw.ai/public/install.ps1");
    expect(workflow).toContain("rm -f mangabaclaw.ai/public/install.cmd");
    expect(workflow).toContain("bun run build");
    expect(workflow).toContain("git push origin HEAD:main");
  });
});
