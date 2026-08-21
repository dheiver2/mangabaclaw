// Doctor config-flow include-warning tests cover config include warnings during repair.
import { describe, expect, it, vi } from "vitest";
import { note } from "../../packages/terminal-core/src/note.js";
import { noteIncludeConfinementWarning } from "./doctor-config-analysis.js";

vi.mock("../../packages/terminal-core/src/note.js", () => ({
  note: vi.fn(),
}));

const noteSpy = vi.mocked(note);

describe("doctor include warning", () => {
  it("surfaces include confinement hint for escaped include paths", () => {
    noteIncludeConfinementWarning({
      path: "/tmp/mangabaclaw-config/mangabaclaw.json",
      issues: [
        {
          message: "Include path escapes config directory: /etc/passwd",
        },
      ],
    });

    expect(noteSpy).toHaveBeenCalledWith(
      [
        "- $include paths must stay under: /tmp/mangabaclaw-config",
        '- Move shared include files under that directory and update to relative paths like "./shared/common.json".',
        "- Error: Include path escapes config directory: /etc/passwd",
      ].join("\n"),
      "Doctor warnings",
    );
  });
});
