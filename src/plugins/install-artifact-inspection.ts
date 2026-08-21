import { isBundleCapabilitySupported } from "./bundle-capability-support.js";
import type { PluginBundleFormat } from "./manifest-types.js";

type PluginArtifactFormat = "mangabaclaw" | PluginBundleFormat;

export const PLUGIN_ARTIFACT_ADAPTER_IDENTITY = "mangabaclaw/v1" as const;

export type PluginInstallArtifactInspection = {
  format: PluginArtifactFormat;
  mapped: string[];
  unavailable: string[];
};

export function inspectNativePluginArtifact(): PluginInstallArtifactInspection {
  return { format: "mangabaclaw", mapped: ["plugin"], unavailable: [] };
}

export function inspectBundlePluginArtifact(params: {
  format: PluginBundleFormat;
  capabilities: Iterable<string>;
}): PluginInstallArtifactInspection {
  const capabilities = [...new Set(params.capabilities)].toSorted();
  return {
    format: params.format,
    mapped: capabilities.filter((capability) =>
      isBundleCapabilitySupported(params.format, capability),
    ),
    unavailable: capabilities.filter(
      (capability) => !isBundleCapabilitySupported(params.format, capability),
    ),
  };
}
