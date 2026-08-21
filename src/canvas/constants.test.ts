import { describe, expect, it } from "vitest";
import {
  isCanvasDocumentHttpPath,
  resolveCanvasNodeCapability,
  withCoreCanvasNodeCapability,
} from "./constants.js";

describe("core canvas contracts", () => {
  it("keeps document auth scoped to the stable Canvas path", () => {
    expect(isCanvasDocumentHttpPath("/__mangabaclaw__/canvas/documents/cv_1/index.html")).toBe(true);
    expect(isCanvasDocumentHttpPath("/__mangabaclaw__/canvas/index.html")).toBe(false);
    expect(
      resolveCanvasNodeCapability([
        "/encoded-path",
        "/__mangabaclaw__/canvas/documents/cv_1/index.html",
      ]),
    ).toEqual({ surface: "canvas", scopeKey: "canvas:canvas" });
  });

  it("advertises one core-owned canvas surface with the historical scope key", () => {
    expect(
      withCoreCanvasNodeCapability([
        { surface: "canvas", scopeKey: "canvas:canvas" },
        { surface: "files", scopeKey: "files:files" },
      ]),
    ).toEqual([
      { surface: "canvas", scopeKey: "canvas:canvas" },
      { surface: "files", scopeKey: "files:files" },
    ]);
  });
});
