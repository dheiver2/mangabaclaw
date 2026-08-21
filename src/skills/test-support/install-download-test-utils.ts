// Install download test utilities provide isolated state and workspace paths.
import {
  createMangabaClawTestState,
  type MangabaClawTestState,
} from "../../test-utils/mangabaclaw-test-state.js";

/** Creates isolated MangabaClaw state for install download tests. */
export async function createInstallDownloadTestState(): Promise<MangabaClawTestState> {
  return await createMangabaClawTestState({
    layout: "state-only",
    prefix: "mangabaclaw-skills-install-",
  });
}
