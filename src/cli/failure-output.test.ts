// Failure output tests cover CLI error formatting and failure summaries.
import { describe, expect, it } from "vitest";
import { GatewayCredentialsRequiredError, GatewayTransportError } from "../gateway/call.js";
import {
  ExpectedCliError,
  formatCliFailureLines,
  formatCliJsonFailure,
  isExpectedCliError,
} from "./failure-output.js";

const PLUGIN_POLICY_MESSAGE =
  'The `mangabaclaw workboard` command is provided by the "workboard" plugin, but that bundled plugin is disabled by default. Run `mangabaclaw plugins enable workboard` to enable that CLI surface.';

describe("formatCliJsonFailure", () => {
  it("uses the canonical typed envelope and redacts the message", () => {
    const token = "sk-abcdefghijklmnopqrstuv";
    const payload = formatCliJsonFailure(new Error(`Authorization: Bearer ${token}`));

    expect(payload).toEqual({
      ok: false,
      error: {
        type: "cli_error",
        message: expect.stringContaining("Authorization: Bearer"),
      },
    });
    expect(payload.error.message).not.toContain(token);
  });
  it("keeps nested causes behind the debug gate", () => {
    const error = new Error("Promotion is not available.", {
      cause: new Error("ClawHub /api/v1/promotions/nope failed (404)"),
    });

    expect(formatCliJsonFailure(error, { env: {} }).error.message).toBe(
      "Promotion is not available.",
    );
    expect(formatCliJsonFailure(error, { env: { MANGABACLAW_DEBUG: "1" } }).error.message).toBe(
      "Promotion is not available. | ClawHub /api/v1/promotions/nope failed (404)",
    );
  });

  it.each([
    { label: "default output", env: {} },
    { label: "debug output", env: { MANGABACLAW_DEBUG: "1" } },
  ])("keeps the full parse guidance unchanged in $label", ({ env }) => {
    const error = Object.assign(
      new ExpectedCliError({
        message: 'MangabaClaw sessions has no command "lst".',
        humanOutput:
          '\u001B[31mMangabaClaw sessions has no command "lst".\u001B[39m\nDid you mean this?\n  mangabaclaw sessions list\nTry: mangabaclaw sessions --help\nDocs: \u001B]8;;https://docs.mangabaclaw.ai/cli\u0007docs.mangabaclaw.ai/cli\u001B]8;;\u0007\n',
        machineOutput:
          'MangabaClaw sessions has no command "lst".\nDid you mean this?\n  mangabaclaw sessions list\nTry: mangabaclaw sessions --help\nDocs: https://docs.mangabaclaw.ai/cli\n',
      }),
      { cause: new Error("internal parse cause") },
    );
    const payload = formatCliJsonFailure(error, { env });

    expect(payload).toEqual({
      ok: false,
      error: {
        type: "cli_error",
        message:
          'MangabaClaw sessions has no command "lst".\nDid you mean this?\n  mangabaclaw sessions list\nTry: mangabaclaw sessions --help\nDocs: https://docs.mangabaclaw.ai/cli',
      },
    });
    expect(payload.error.message).not.toContain("internal parse cause");
  });
  it("keeps plugin policy messages in the canonical JSON envelope", () => {
    const error = new ExpectedCliError({
      message: PLUGIN_POLICY_MESSAGE,
      humanOutput: PLUGIN_POLICY_MESSAGE,
      machineOutput: PLUGIN_POLICY_MESSAGE,
    });

    expect(formatCliJsonFailure(error)).toEqual({
      ok: false,
      error: { type: "cli_error", message: PLUGIN_POLICY_MESSAGE },
    });
  });

  it.each([
    { label: "default output", env: {} },
    { label: "debug output", env: { MANGABACLAW_DEBUG: "1" } },
  ])("keeps gateway credential guidance unchanged in $label", ({ env }) => {
    const error = new GatewayCredentialsRequiredError({
      method: "device.pair.list",
      configPath: "/tmp/mangabaclaw.json",
    });

    expect(formatCliJsonFailure(error, { env })).toEqual({
      ok: false,
      error: {
        type: "cli_error",
        message: error.message,
      },
    });
  });
});

describe("formatCliFailureLines", () => {
  it.each([
    { label: "default output", env: {} },
    { label: "debug output", env: { MANGABACLAW_DEBUG: "1" } },
  ])("emits expected guidance only when not already written in $label", ({ env }) => {
    const pending = new ExpectedCliError({
      message: "bad input",
      humanOutput: "\u001B[31mfirst\u001B[39m\nsecond\n",
      machineOutput: "first\nsecond\n",
    });
    const written = new ExpectedCliError({
      message: "bad input",
      humanOutput: "\u001B[31mfirst\u001B[39m\nsecond\n",
      humanOutputWritten: true,
      machineOutput: "first\nsecond\n",
    });

    expect(formatCliFailureLines({ title: "ignored", error: pending, env })).toEqual([
      "\u001B[31mfirst\u001B[39m",
      "second",
    ]);
    expect(formatCliFailureLines({ title: "ignored", error: written, env })).toEqual([]);
  });

  it("shows a concise reason and recovery commands by default", () => {
    const lines = formatCliFailureLines({
      title: "Could not start the CLI.",
      error: new Error("config file is invalid", {
        cause: new Error("unexpected token at /internal/config.json:12"),
      }),
      argv: ["node", "mangabaclaw", "status"],
      env: {},
    });

    expect(lines).toEqual([
      "[mangabaclaw] Could not start the CLI.",
      "[mangabaclaw] Reason: config file is invalid",
      "[mangabaclaw] Debug: set MANGABACLAW_DEBUG=1 to include the stack trace.",
      "[mangabaclaw] Try: mangabaclaw doctor",
      "[mangabaclaw] Help: mangabaclaw --help",
    ]);
  });

  it.each([
    {
      label: "plugin policy refusal",
      createError: () =>
        new ExpectedCliError({
          message: PLUGIN_POLICY_MESSAGE,
          humanOutput: PLUGIN_POLICY_MESSAGE,
          machineOutput: PLUGIN_POLICY_MESSAGE,
        }),
    },
    {
      label: "missing gateway credentials",
      createError: () =>
        new GatewayCredentialsRequiredError({
          method: "device.pair.list",
          configPath: "/tmp/mangabaclaw.json",
        }),
    },
    {
      label: "unreachable gateway",
      createError: () =>
        new GatewayTransportError({
          kind: "closed",
          message:
            "Gateway not reachable at ws://127.0.0.1:51078 (ECONNREFUSED).\nStart it with `mangabaclaw gateway run` or check `mangabaclaw gateway status`.",
          connectionDetails: {
            url: "ws://127.0.0.1:51078",
            urlSource: "local loopback",
            message: "Gateway target: ws://127.0.0.1:51078",
          },
        }),
    },
  ])(
    "routes $label through the shared expected-condition predicate without crash framing",
    ({ createError }) => {
      const error = createError();

      expect(isExpectedCliError(error)).toBe(true);
      const lines = formatCliFailureLines({
        title: "The CLI command failed.",
        error,
        env: { MANGABACLAW_DEBUG: "1" },
      });

      expect(lines).toEqual(error.message.split("\n"));
      const output = lines.join("\n");
      expect(output).not.toContain("[mangabaclaw] The CLI command failed.");
      expect(output).not.toContain("[mangabaclaw] Reason:");
      expect(output).not.toContain("MANGABACLAW_DEBUG");
      expect(output).not.toContain("Stack:");
      expect(output).not.toContain("mangabaclaw doctor");
    },
  );

  it("prints stack details when debug output is requested", () => {
    const lines = formatCliFailureLines({
      title: "The CLI command failed.",
      error: new Error("boom"),
      env: { MANGABACLAW_DEBUG: "1" },
    });

    expect(lines.slice(0, 4)).toEqual([
      "[mangabaclaw] The CLI command failed.",
      "[mangabaclaw] Reason: boom",
      "[mangabaclaw] Stack:",
      "[mangabaclaw] Error: boom",
    ]);
    expect(lines.join("\n")).toContain("Error: boom");
  });

  it.each(["--debug", "--verbose"])("prints stack details for the root %s option", (debugFlag) => {
    const lines = formatCliFailureLines({
      title: "The CLI command failed.",
      error: new Error("boom", { cause: new Error("transport detail") }),
      argv: ["node", "mangabaclaw", "proxy", "run", debugFlag],
      env: {},
    });

    expect(lines).toContain("[mangabaclaw] Reason: boom | transport detail");
    expect(lines).toContain("[mangabaclaw] Stack:");
    expect(lines).toContain("[mangabaclaw] Error: boom");
  });

  it.each(["--debug", "--verbose"])(
    "does not enable root stack traces for a child %s option",
    (debugFlag) => {
      const lines = formatCliFailureLines({
        title: "The CLI command failed.",
        error: new Error("boom"),
        argv: ["node", "mangabaclaw", "proxy", "run", "--", "child", debugFlag],
        env: {},
      });

      expect(lines).not.toContain("[mangabaclaw] Stack:");
      expect(lines).toContain("[mangabaclaw] Debug: set MANGABACLAW_DEBUG=1 to include the stack trace.");
    },
  );
});
