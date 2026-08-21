// JSON output mode tests cover CLI JSON mode detection and output handling.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loggingState } from "../logging/state.js";
import {
  applyResolvedCommandOutputMode,
  hasJsonOutputFlag,
  isJsonOutputModeActive,
  withConsoleLogsRoutedToStderrForJson,
} from "./json-output-mode.js";

describe("json output mode", () => {
  const originalForceStderr = loggingState.forceConsoleToStderr;
  const originalEarlyRestore = loggingState.earlyConsoleRoutingRestore;

  beforeEach(() => {
    loggingState.forceConsoleToStderr = false;
    loggingState.earlyConsoleRoutingRestore = null;
  });

  afterEach(() => {
    loggingState.forceConsoleToStderr = originalForceStderr;
    loggingState.earlyConsoleRoutingRestore = originalEarlyRestore;
  });

  it("detects json output flags before argv terminators", () => {
    expect(hasJsonOutputFlag(["node", "mangabaclaw", "nodes", "list", "--json"])).toBe(true);
    expect(hasJsonOutputFlag(["node", "mangabaclaw", "nodes", "list", "--json=true"])).toBe(true);
    expect(hasJsonOutputFlag(["node", "mangabaclaw", "models", "--status-json"])).toBe(false);
    expect(hasJsonOutputFlag(["node", "mangabaclaw", "nodes", "--", "--json"])).toBe(false);
  });

  it("temporarily routes console logs to stderr while json output is being prepared", async () => {
    const snapshots: boolean[] = [];

    await withConsoleLogsRoutedToStderrForJson(
      ["node", "mangabaclaw", "nodes", "list", "--json"],
      async () => {
        snapshots.push(loggingState.forceConsoleToStderr);
      },
    );

    expect(snapshots).toEqual([true]);
    expect(loggingState.forceConsoleToStderr).toBe(false);
  });

  it("leaves existing stderr routing enabled after json output preparation", async () => {
    loggingState.forceConsoleToStderr = true;

    await withConsoleLogsRoutedToStderrForJson(
      ["node", "mangabaclaw", "nodes", "list", "--json"],
      async () => {
        expect(loggingState.forceConsoleToStderr).toBe(true);
      },
    );

    expect(loggingState.forceConsoleToStderr).toBe(true);
  });

  it("restores stdout routing when command metadata marks --json as parse-only", async () => {
    await withConsoleLogsRoutedToStderrForJson(
      ["node", "mangabaclaw", "config", "set", "gateway.port", "18789", "--json"],
      async () => {
        expect(loggingState.forceConsoleToStderr).toBe(true);
        applyResolvedCommandOutputMode(false);
        expect(loggingState.forceConsoleToStderr).toBe(false);
        expect(
          isJsonOutputModeActive(["node", "mangabaclaw", "config", "set", "x", "1", "--json"]),
        ).toBe(false);
      },
    );
  });

  it("does not treat config set's parser alias as JSON output before Commander resolves it", () => {
    expect(isJsonOutputModeActive(["node", "mangabaclaw", "config", "set", "x", "1", "--json"])).toBe(
      false,
    );
  });

  it("preserves inherited stderr routing when resolved metadata is parse-only", async () => {
    loggingState.forceConsoleToStderr = true;

    await withConsoleLogsRoutedToStderrForJson(
      ["node", "mangabaclaw", "config", "set", "gateway.port", "18789", "--json"],
      async () => {
        applyResolvedCommandOutputMode(false);
        expect(loggingState.forceConsoleToStderr).toBe(true);
      },
    );
  });
});
