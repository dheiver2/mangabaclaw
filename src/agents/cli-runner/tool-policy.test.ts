import { describe, expect, it } from "vitest";
import {
  buildCliBackendToolAvailability,
  resolveCliRuntimeToolsAllow,
  stripMangabaClawMcpToolPrefix,
} from "./tool-policy.js";

describe("buildCliBackendToolAvailability", () => {
  it("keeps canonical names and projects the shipped beta MCP transport names", () => {
    expect(
      buildCliBackendToolAvailability({ native: ["Read"], mangabaClaw: ["message", "write"] }),
    ).toEqual({
      native: ["Read"],
      mangabaClaw: ["message", "write"],
      mcp: ["mcp__mangabaclaw__message", "mcp__mangabaclaw__write"],
    });
  });
});

describe("stripMangabaClawMcpToolPrefix", () => {
  it("strips only the loopback transport prefix", () => {
    expect(stripMangabaClawMcpToolPrefix("mcp__mangabaclaw__memory_search")).toBe("memory_search");
    expect(stripMangabaClawMcpToolPrefix("memory_search")).toBe("memory_search");
    expect(stripMangabaClawMcpToolPrefix("mcp__other__tool")).toBe("mcp__other__tool");
  });
});

describe("resolveCliRuntimeToolsAllow", () => {
  it("keeps every concrete restriction, including server-managed defaults", () => {
    expect(resolveCliRuntimeToolsAllow(undefined)).toBeUndefined();
    expect(resolveCliRuntimeToolsAllow(["memory_search"], true)).toEqual(["memory_search"]);
    expect(resolveCliRuntimeToolsAllow(["*"])).toBeUndefined();
    expect(resolveCliRuntimeToolsAllow(["memory_search"])).toEqual(["memory_search"]);
  });
});
