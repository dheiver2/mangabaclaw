import type { MangabaClawConfig } from "../../config/types.mangabaclaw.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { ChannelSetupInput } from "./setup-input.js";

export type ChannelSetupAdapter<Input extends { name?: string } = ChannelSetupInput> = {
  resolveAccountId?: (params: { cfg: MangabaClawConfig; accountId?: string; input?: Input }) => string;
  prepareAccountConfigInput?: (params: {
    cfg: MangabaClawConfig;
    accountId: string;
    input: Input;
    runtime: RuntimeEnv;
  }) => Promise<Input> | Input;
  resolveBindingAccountId?: (params: {
    cfg: MangabaClawConfig;
    agentId: string;
    accountId?: string;
  }) => string | undefined;
  applyAccountName?: (params: {
    cfg: MangabaClawConfig;
    accountId: string;
    name?: string;
  }) => MangabaClawConfig;
  applyAccountConfig: (params: {
    cfg: MangabaClawConfig;
    accountId: string;
    input: Input;
  }) => MangabaClawConfig;
  afterAccountConfigWritten?: (params: {
    previousCfg: MangabaClawConfig;
    cfg: MangabaClawConfig;
    accountId: string;
    input: Input;
    runtime: RuntimeEnv;
  }) => Promise<void> | void;
  validateInput?: (params: {
    cfg: MangabaClawConfig;
    accountId: string;
    input: Input;
  }) => string | null;
  singleAccountKeysToMove?: readonly string[];
  namedAccountPromotionKeys?: readonly string[];
  resolveSingleAccountPromotionTarget?: (params: {
    channel: Record<string, unknown>;
  }) => string | undefined;
};
