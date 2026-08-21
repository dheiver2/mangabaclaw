import "./workspace-legacy-state.js";

type WorkspaceLegacyStateTestApi = {
  resetLegacyWorkspaceStateCheckForTest(): void;
};

function getTestApi(): WorkspaceLegacyStateTestApi {
  const api = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("mangabaclaw.workspaceLegacyStateTestApi")
  ];
  if (!api) {
    throw new Error("workspace legacy state test API is unavailable");
  }
  return api as WorkspaceLegacyStateTestApi;
}

export function resetLegacyWorkspaceStateCheckForTest(): void {
  getTestApi().resetLegacyWorkspaceStateCheckForTest();
}
