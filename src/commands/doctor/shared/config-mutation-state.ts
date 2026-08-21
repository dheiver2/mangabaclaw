// Shared doctor state helpers for previewing or applying config mutations.
import { inheritLegacyDefaultAgentId } from "../../../config/legacy.default-agent-owner.js";
import type { MangabaClawConfig } from "../../../config/types.mangabaclaw.js";

export type DoctorConfigMutationState = {
  /** Config currently used for command execution. */
  cfg: MangabaClawConfig;
  /** Best candidate config after pending doctor mutations. */
  candidate: MangabaClawConfig;
  /** True when candidate differs from the persisted/effective config path. */
  pendingChanges: boolean;
  /** User-facing fix hints printed when preview mode leaves changes unapplied. */
  fixHints: string[];
};

export type DoctorConfigMutationResult = {
  /** Candidate config after the mutation. */
  config: MangabaClawConfig;
  /** User-facing change lines; empty means no mutation should be applied. */
  changes: string[];
};

/** Apply a config mutation to doctor state, writing cfg only in repair mode. */
export function applyDoctorConfigMutation(params: {
  state: DoctorConfigMutationState;
  mutation: DoctorConfigMutationResult;
  shouldRepair: boolean;
  fixHint?: string;
}): DoctorConfigMutationState {
  if (params.mutation.changes.length === 0) {
    return params.state;
  }
  const config = inheritLegacyDefaultAgentId(params.state.candidate, params.mutation.config);

  return {
    cfg: params.shouldRepair ? config : params.state.cfg,
    candidate: config,
    pendingChanges: true,
    fixHints:
      !params.shouldRepair && params.fixHint
        ? [...params.state.fixHints, params.fixHint]
        : params.state.fixHints,
  };
}
