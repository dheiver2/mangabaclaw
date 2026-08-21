// Whatsapp plugin module implements active listener behavior.
import type { MangabaClawConfig } from "mangabaclaw/plugin-sdk/config-contracts";
import { resolveDefaultWhatsAppAccountId } from "./account-ids.js";
import { getWhatsAppConnectionController } from "./connection-controller-runtime-context.js";
import type { ActiveWebListener } from "./inbound/types.js";

export type { ActiveWebListener, ActiveWebSendOptions } from "./inbound/types.js";

export function resolveWebAccountId(params: {
  cfg: MangabaClawConfig;
  accountId?: string | null;
}): string {
  return (params.accountId ?? "").trim() || resolveDefaultWhatsAppAccountId(params.cfg);
}

export function getActiveWebListener(accountId: string): ActiveWebListener | null {
  return getWhatsAppConnectionController(accountId)?.getActiveListener() ?? null;
}
