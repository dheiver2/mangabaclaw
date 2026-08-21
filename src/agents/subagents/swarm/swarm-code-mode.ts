/** Internal host-only metadata used to make Code Mode collector spawns replay-safe. */
export const SWARM_CODE_MODE_IDEMPOTENCY_KEY = Symbol.for("mangabaclaw.swarmCodeModeIdempotencyKey");

export const SWARM_CODE_MODE_REQUEST_FINGERPRINT = Symbol.for(
  "mangabaclaw.swarmCodeModeRequestFingerprint",
);
