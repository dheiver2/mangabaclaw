// Browser tests cover evaluate source normalization.
import { describe, expect, it } from "vitest";
import { normalizeBrowserEvaluateFunctionSource } from "./evaluate-source.js";

describe("normalizeBrowserEvaluateFunctionSource", () => {
  it("preserves function sources", () => {
    expect(normalizeBrowserEvaluateFunctionSource("() => document.title")).toBe(
      "() => document.title",
    );
    expect(normalizeBrowserEvaluateFunctionSource("async (el) => el.textContent")).toBe(
      "async (el) => el.textContent",
    );
  });

  it("wraps expressions as page functions", () => {
    expect(normalizeBrowserEvaluateFunctionSource("document.title")).toBe(
      [
        "() => {",
        "const __mangabaclawEvaluateExpressionResult = (document.title);",
        'return typeof __mangabaclawEvaluateExpressionResult === "function" ? __mangabaclawEvaluateExpressionResult() : __mangabaclawEvaluateExpressionResult;',
        "}",
      ].join("\n"),
    );
  });

  it("preserves function-valued expression invocation", () => {
    expect(normalizeBrowserEvaluateFunctionSource("extractTitle")).toBe(
      [
        "() => {",
        "const __mangabaclawEvaluateExpressionResult = (extractTitle);",
        'return typeof __mangabaclawEvaluateExpressionResult === "function" ? __mangabaclawEvaluateExpressionResult() : __mangabaclawEvaluateExpressionResult;',
        "}",
      ].join("\n"),
    );
    expect(normalizeBrowserEvaluateFunctionSource("extractText", { argumentName: "el" })).toBe(
      [
        "(el) => {",
        "const __mangabaclawEvaluateExpressionResult = (extractText);",
        'return typeof __mangabaclawEvaluateExpressionResult === "function" ? __mangabaclawEvaluateExpressionResult(el) : __mangabaclawEvaluateExpressionResult;',
        "}",
      ].join("\n"),
    );
  });

  it("wraps statement bodies as async page functions", () => {
    expect(normalizeBrowserEvaluateFunctionSource("const x = 41; return x + 1;")).toBe(
      "async () => {\nconst x = 41; return x + 1;\n}",
    );
    expect(
      normalizeBrowserEvaluateFunctionSource(
        "function helper() { return 41; }\nreturn helper() + 1;",
      ),
    ).toBe("async () => {\nfunction helper() { return 41; }\nreturn helper() + 1;\n}");
  });

  it("wraps statement bodies as async element functions when a ref is present", () => {
    expect(
      normalizeBrowserEvaluateFunctionSource("const text = el.textContent; return text;", {
        argumentName: "el",
      }),
    ).toBe("async (el) => {\nconst text = el.textContent; return text;\n}");
  });
});
