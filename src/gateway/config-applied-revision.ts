import type { MangabaClawConfig } from "../config/types.mangabaclaw.js";
import type { GatewayReloadPlan } from "./config-reload-plan.js";

type AppliedCallback = (
  plan: GatewayReloadPlan,
  nextConfig: MangabaClawConfig,
) => void | Promise<void>;

export function createConfigAppliedRevisionTracker(options: {
  onConfigApplied?: AppliedCallback;
  onRevisionApplied?: (hash: string) => void;
}) {
  let pending: { plan: GatewayReloadPlan; hash: string } | null = null;
  const flush = async (currentConfig: MangabaClawConfig) => {
    const owner = pending;
    if (!owner) {
      return;
    }
    await options.onConfigApplied?.(owner.plan, currentConfig);
    // A superseding transaction runs later; this committed owner is runtime truth meanwhile.
    options.onRevisionApplied?.(owner.hash);
    if (pending === owner) {
      pending = null;
    }
  };
  return {
    defer: (plan: GatewayReloadPlan, hash: string) => {
      pending = { plan, hash };
    },
    flush,
    apply: async (plan: GatewayReloadPlan, config: MangabaClawConfig, hash: string) => {
      if (pending?.plan === plan) {
        await flush(config);
        return;
      }
      await options.onConfigApplied?.(plan, config);
      options.onRevisionApplied?.(hash);
    },
  };
}
