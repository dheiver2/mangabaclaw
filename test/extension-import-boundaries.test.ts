// Extension import boundary tests enforce extension/core import rules.
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExtensionPluginSdkBoundaryChecker } from "../scripts/check-extension-plugin-sdk-boundary.mts";
import { main as sdkPackageMain } from "../scripts/check-sdk-package-extension-import-boundary.mts";
import { main as srcExtensionMain } from "../scripts/check-src-extension-import-boundary.mts";
import { createCapturedIo } from "./helpers/captured-io.js";
import { useAutoCleanupTempDirTracker } from "./helpers/temp-dir.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

type CapturedIo = ReturnType<typeof createCapturedIo>["io"];
type JsonOutputPromise = ReturnType<typeof getJsonOutput>;

const boundaryInventoryCases: Array<{
  name: string;
  output: JsonOutputPromise;
}> = [
  {
    name: "src extension import boundary",
    output: getJsonOutput(srcExtensionMain, ["--json"]),
  },
  {
    name: "sdk/package extension import boundary",
    output: getJsonOutput(sdkPackageMain, ["--json"]),
  },
];

describe("extension import boundary inventories", () => {
  it.each(boundaryInventoryCases)("$name JSON output stays empty", async ({ output }) => {
    const jsonOutput = await output;

    expect(jsonOutput.exitCode).toBe(0);
    expect(jsonOutput.stderr).toBe("");
    expect(jsonOutput.json).toStrictEqual([]);
  });
});

type BoundaryFixture = {
  file?: string;
  packageJson?: unknown;
  source: string;
};

function createBoundaryFixture(fixture: BoundaryFixture) {
  const repoRoot = tempDirs.make("mangabaclaw-normalization-boundary-");
  const pluginRoot = path.join(repoRoot, "extensions", "demo");
  const relativeFile = fixture.file ?? "src/runtime.ts";
  const filePath = path.join(pluginRoot, relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, fixture.source, "utf8");
  fs.writeFileSync(
    path.join(pluginRoot, "package.json"),
    JSON.stringify(fixture.packageJson ?? { name: "@mangabaclaw/demo" }),
    "utf8",
  );
  return createExtensionPluginSdkBoundaryChecker({ repoRoot });
}

describe("production plugin normalization ownership boundary", () => {
  it.each([
    {
      name: "static string import",
      source:
        'import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";',
      kind: "import",
      specifier: "@mangabaclaw/normalization-core/string-coerce",
      resolvedPath: "packages/normalization-core/src/string-coerce.ts",
      facade: "mangabaclaw/plugin-sdk/string-coerce-runtime",
    },
    {
      name: "record re-export from public barrel",
      file: "api.ts",
      source: 'export { isRecord } from "@mangabaclaw/normalization-core/record-coerce";',
      kind: "export",
      specifier: "@mangabaclaw/normalization-core/record-coerce",
      resolvedPath: "packages/normalization-core/src/record-coerce.ts",
      facade: "mangabaclaw/plugin-sdk/string-coerce-runtime",
    },
    {
      name: "dynamic number import",
      source: 'await import("@mangabaclaw/normalization-core/number-coercion");',
      kind: "dynamic-import",
      specifier: "@mangabaclaw/normalization-core/number-coercion",
      resolvedPath: "packages/normalization-core/src/number-coercion.ts",
      facade: "mangabaclaw/plugin-sdk/number-runtime",
    },
    {
      name: "error import",
      source: 'import { toErrorObject } from "@mangabaclaw/normalization-core/error-coercion";',
      kind: "import",
      specifier: "@mangabaclaw/normalization-core/error-coercion",
      resolvedPath: "packages/normalization-core/src/error-coercion.ts",
      facade: "mangabaclaw/plugin-sdk/error-runtime",
    },
    {
      name: "bare package import",
      source: 'import { expectDefined } from "@mangabaclaw/normalization-core";',
      kind: "import",
      specifier: "@mangabaclaw/normalization-core",
      resolvedPath: "packages/normalization-core/src/index.ts",
    },
    {
      name: "relative normalization-core escape",
      source:
        'import { isRecord } from "../../../packages/normalization-core/src/record-coerce.js";',
      kind: "import",
      specifier: "../../../packages/normalization-core/src/record-coerce.js",
      resolvedPath: "packages/normalization-core/src/record-coerce.js",
      facade: "mangabaclaw/plugin-sdk/string-coerce-runtime",
    },
    {
      name: "relative boolean owner escape",
      source: 'import { parseBooleanValue } from "../../../src/utils/boolean.js";',
      kind: "import",
      specifier: "../../../src/utils/boolean.js",
      resolvedPath: "src/utils/boolean.js",
      facade: "mangabaclaw/plugin-sdk/string-coerce-runtime",
    },
    {
      name: "relative core error owner escape",
      source: 'import { formatErrorMessage } from "../../../src/infra/errors.js";',
      kind: "import",
      specifier: "../../../src/infra/errors.js",
      resolvedPath: "src/infra/errors.js",
      facade: "mangabaclaw/plugin-sdk/error-runtime",
    },
  ])(
    "rejects $name with a specific SDK facade when known",
    async ({ source, file, kind, specifier, resolvedPath, facade }) => {
      const checker = createBoundaryFixture({ source, file });
      const captured = createCapturedIo();
      const exitCode = await checker.main(
        ["--mode=normalization-core-bypass", "--json"],
        captured.io,
      );
      const entries = JSON.parse(captured.readStdout()) as Array<Record<string, unknown>>;

      expect(exitCode).toBe(1);
      expect(captured.readStderr()).toBe("");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        file: `extensions/demo/${file ?? "src/runtime.ts"}`,
        line: 1,
        kind,
        specifier,
        resolvedPath,
      });
      expect(entries[0]?.reason).toContain(facade ?? "matching mangabaclaw/plugin-sdk facade");
      if (facade === "mangabaclaw/plugin-sdk/number-runtime") {
        expect(entries[0]?.reason).toContain("bundled/private-local");
      }
    },
  );

  it.each([
    {
      name: "approved SDK facades",
      source: [
        'import "mangabaclaw/plugin-sdk/string-coerce-runtime";',
        'import "mangabaclaw/plugin-sdk/number-runtime";',
        'import "mangabaclaw/plugin-sdk/error-runtime";',
      ].join("\n"),
    },
    { name: "plugin-local import", source: 'import "./local.js";' },
    {
      name: "test source",
      file: "src/runtime.test.ts",
      source: 'import "@mangabaclaw/normalization-core/record-coerce";',
    },
    {
      name: "dist generated source",
      file: "dist/generated.js",
      source: 'import "@mangabaclaw/normalization-core/record-coerce";',
    },
    {
      name: "declared generated asset",
      file: "src/generated.js",
      packageJson: {
        name: "@mangabaclaw/demo",
        mangabaclaw: {
          assetScripts: { build: "node build.mjs" },
          build: { staticAssets: [{ source: "src/generated.js", output: "generated.js" }] },
        },
      },
      source: 'import "@mangabaclaw/normalization-core/record-coerce";',
    },
  ])("allows $name", async ({ source, file, packageJson }) => {
    const checker = createBoundaryFixture({ source, file, packageJson });
    const captured = createCapturedIo();

    expect(await checker.main(["--mode=normalization-core-bypass", "--json"], captured.io)).toBe(0);
    expect(captured.readStderr()).toBe("");
    expect(JSON.parse(captured.readStdout())).toEqual([]);
  });

  it("renders actionable human diagnostics and fails strict mode", async () => {
    const checker = createBoundaryFixture({
      source: 'export { toErrorObject } from "@mangabaclaw/normalization-core/error-coercion";',
      file: "runtime-api.ts",
    });
    const captured = createCapturedIo();

    expect(await checker.main(["--mode=normalization-core-bypass"], captured.io)).toBe(1);
    expect(captured.readStdout()).toContain(
      "Rule: production bundled plugins must not import normalization-core directly",
    );
    expect(captured.readStdout()).toContain("extensions/demo/runtime-api.ts");
    expect(captured.readStdout()).toContain("line 1 [export]");
    expect(captured.readStdout()).toContain("re-exports");
    expect(captured.readStdout()).toContain("@mangabaclaw/normalization-core/error-coercion");
    expect(captured.readStdout()).toContain("mangabaclaw/plugin-sdk/error-runtime");
    expect(captured.readStderr()).toContain("violations found (1)");
  });

  it("rejects plugin-sdk-internal through the strict src-outside-plugin-sdk rule", async () => {
    const checker = createBoundaryFixture({
      source: 'import "../../../src/plugin-sdk-internal/private.js";',
    });
    const captured = createCapturedIo();

    expect(await checker.main(["--mode=src-outside-plugin-sdk"], captured.io)).toBe(1);
    expect(captured.readStdout()).toContain("src/plugin-sdk-internal/private.js");
    expect(captured.readStderr()).toContain("violations found (1)");
  });
});

async function getJsonOutput(
  main: (argv: string[], io: CapturedIo) => Promise<number>,
  argv: string[],
) {
  const captured = createCapturedIo();
  const exitCode = await main(argv, captured.io);
  return {
    exitCode,
    stderr: captured.readStderr(),
    json: JSON.parse(captured.readStdout()),
  };
}
