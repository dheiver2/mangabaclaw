// Sglang tests cover provider discovery.contract plugin behavior.
import { fileURLToPath } from "node:url";
import { describeSglangProviderDiscoveryContract } from "mangabaclaw/plugin-sdk/provider-test-contracts";

describeSglangProviderDiscoveryContract({
  load: () => import("./index.js"),
  apiModuleId: fileURLToPath(new URL("./api.js", import.meta.url)),
});
