import { describe, expect, it } from "vitest";
import { isMemoryMachineOutput } from "./cli-output-mode.js";

describe("LanceDB CLI output mode", () => {
  it.each(["list", "query", "search"])("detects ltm %s as machine output", (command) => {
    expect(isMemoryMachineOutput({ argv: ["node", "mangabaclaw", "ltm", command] })).toBe(true);
  });

  it("leaves stats human-readable", () => {
    expect(isMemoryMachineOutput({ argv: ["node", "mangabaclaw", "ltm", "stats"] })).toBe(false);
  });

  it("accepts a post-root log level", () => {
    expect(
      isMemoryMachineOutput({
        argv: ["node", "mangabaclaw", "ltm", "--log-level", "debug", "list"],
      }),
    ).toBe(true);
  });
});
