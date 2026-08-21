import { describe, expect, it } from "vitest";
import { classifyNodeWorkspaceTransferPath } from "./gateway-http-route-contracts.js";

describe("classifyNodeWorkspaceTransferPath", () => {
  it.each([
    ["/__mangabaclaw__/worker-transfer", "namespace"],
    ["/__mangabaclaw__/worker-transfer/v1/environments/worker%3A1/blobs/abc", "namespace"],
    ["/__mangabaclaw__/worker-transfer-other", "outside"],
    ["/__mangabaclaw__/worker", "outside"],
  ] as const)("classifies %s as %s", (pathname, expected) => {
    expect(classifyNodeWorkspaceTransferPath(pathname)).toBe(expected);
  });
});
