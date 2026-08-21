/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import "./memory-dreaming-page.ts";

type DreamsPageElement = HTMLElement & {
  agentId: string | null;
  updateComplete: Promise<unknown>;
};

describe("MemoryDreamingSettings", () => {
  it("hosts only the selected agent's memory panel without global config", async () => {
    const element = document.createElement("mangabaclaw-memory-dreaming") as DreamsPageElement;
    element.agentId = null;
    document.body.append(element);
    try {
      await element.updateComplete;
      expect(element.querySelector("mangabaclaw-agent-memory-panel")).toBeNull();
      expect(element.textContent).not.toContain("Dreaming frequency");
      expect(element.querySelector("mangabaclaw-agent-select")).toBeNull();
    } finally {
      element.remove();
    }
  });
});
