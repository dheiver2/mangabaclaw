// Read-only device pairing snapshots avoid joining the shared-state writer lifecycle.
import { withExistingMangabaClawStateDatabaseReadOnly } from "../state/mangabaclaw-state-db-readonly.js";
import {
  readDevicePairingStoreStateFromDatabase,
  type DevicePairingStoreState,
} from "./device-pairing-store.js";

/** Load pairing state without creating or migrating the shared state database. */
export function loadDevicePairingStoreStateReadOnly(baseDir?: string): DevicePairingStoreState {
  const options = baseDir ? { env: { ...process.env, MANGABACLAW_STATE_DIR: baseDir } } : {};
  return (
    withExistingMangabaClawStateDatabaseReadOnly(
      ({ db }) => readDevicePairingStoreStateFromDatabase(db),
      options,
    ) ?? { pendingById: {}, pairedByDeviceId: {} }
  );
}
