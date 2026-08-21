import { isRecord } from "@mangabaclaw/normalization-core/record-coerce";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionGitHubPublicationResult } from "../../packages/gateway-protocol/src/index.js";
import {
  loadTranscriptEvents,
  upsertSessionEntryCore,
} from "../config/sessions/session-accessor.js";
import { closeMangabaClawAgentDatabasesForTest } from "../state/mangabaclaw-agent-db.js";
import { closeMangabaClawStateDatabaseForTest } from "../state/mangabaclaw-state-db.js";
import { withMangabaClawTestState } from "../test-utils/mangabaclaw-test-state.js";
import { createGitHubPublicationTranscriptReporter } from "./github-publication-transcript.js";

afterEach(() => {
  closeMangabaClawAgentDatabasesForTest();
  closeMangabaClawStateDatabaseForTest();
});

describe("GitHub publication transcript reporting", () => {
  it.each([
    {
      label: "published",
      result: {
        requestId: "publication-success",
        status: "published",
        url: "https://github.com/mangabaclaw/mangabaclaw/pull/1",
        repository: "mangabaclaw/mangabaclaw",
        branch: "mangabaclaw/task",
        headCommit: "a".repeat(40),
      } satisfies SessionGitHubPublicationResult,
      visibleText: "https://github.com/mangabaclaw/mangabaclaw/pull/1",
    },
    {
      label: "failed",
      result: {
        requestId: "publication-failure",
        status: "failed",
        code: "push_rejected",
        message: "GitHub publication failed.",
        nextAction: "Check repository write access and retry.",
      } satisfies SessionGitHubPublicationResult,
      visibleText: "Check repository write access and retry.",
    },
  ])(
    "appends one projected assistant message for a $label result",
    async ({ result, visibleText }) => {
      await withMangabaClawTestState({ scenario: "minimal" }, async () => {
        const sessionKey = "agent:main:main";
        const sessionId = "publication-transcript";
        await upsertSessionEntryCore({ agentId: "main", sessionKey }, { sessionId, updatedAt: 1 });
        const markReported = vi.fn();
        const reporter = createGitHubPublicationTranscriptReporter(
          async () => {
            const runtime = await import("./session-utils.js");
            return {
              resolveCanonicalSessionEntryFromStoreKeys:
                runtime.resolveCanonicalSessionEntryFromStoreKeys,
              resolveGatewaySessionStoreTargetWithStore:
                runtime.resolveGatewaySessionStoreTargetWithStore,
            };
          },
          { markReported },
        );

        await reporter({ sessionId, sessionKey, agentId: "main", result });
        await reporter({ sessionId, sessionKey, agentId: "main", result });

        const events = await loadTranscriptEvents({ agentId: "main", sessionId, sessionKey });
        const messages = events.filter(
          (event) =>
            isRecord(event) &&
            event.type === "message" &&
            isRecord(event.message) &&
            event.message.role === "assistant" &&
            event.message.responseId === `github-publication:${result.requestId}`,
        );
        expect(messages).toHaveLength(1);
        expect(JSON.stringify(messages[0])).toContain(visibleText);
        expect(markReported).toHaveBeenCalledWith(result.requestId);
      });
    },
  );
});
