// Runs plugin message preprocessing hooks before reply prompt construction.
import { normalizeOptionalString } from "@mangabaclaw/normalization-core/string-coerce";
import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import { fireAndForgetHook } from "../../hooks/fire-and-forget.js";
import { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.js";
import {
  deriveInboundMessageHookContext,
  toInternalMessagePreprocessedContext,
  toInternalMessageTranscribedContext,
} from "../../hooks/message-hook-mappers.js";
import type { FinalizedMsgContext } from "../templating.js";

export function emitPreAgentMessageHooks(params: {
  ctx: FinalizedMsgContext;
  cfg: MangabaClawConfig;
  isFastTestEnv: boolean;
}): void {
  if (params.isFastTestEnv) {
    return;
  }
  const sessionKey = normalizeOptionalString(params.ctx.SessionKey);
  if (!sessionKey) {
    return;
  }

  const canonical = deriveInboundMessageHookContext(params.ctx);
  if (canonical.transcript) {
    fireAndForgetHook(
      triggerInternalHook(
        createInternalHookEvent(
          "message",
          "transcribed",
          sessionKey,
          toInternalMessageTranscribedContext(canonical, params.cfg),
        ),
      ),
      "get-reply: message:transcribed internal hook failed",
    );
  }

  fireAndForgetHook(
    triggerInternalHook(
      createInternalHookEvent(
        "message",
        "preprocessed",
        sessionKey,
        toInternalMessagePreprocessedContext(canonical, params.cfg),
      ),
    ),
    "get-reply: message:preprocessed internal hook failed",
  );
}
