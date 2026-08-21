import { runMangabaClawStateWriteTransaction } from "../state/mangabaclaw-state-db.js";
import {
  readChannelPairingState,
  sqliteOptionsForEnv,
  writeChannelPairingStateToDatabase,
} from "./pairing-store-sqlite.js";
import type { PairingChannel } from "./pairing-store.types.js";

type ChannelPairingState = ReturnType<typeof readChannelPairingState>;

export function readChannelPairingStateSnapshot(
  channel: PairingChannel,
  env: NodeJS.ProcessEnv = process.env,
): ChannelPairingState {
  return readChannelPairingState(channel, env);
}

export function writeChannelPairingStateSnapshot(
  channel: PairingChannel,
  state: ChannelPairingState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  runMangabaClawStateWriteTransaction(
    (database) => writeChannelPairingStateToDatabase(database, channel, state),
    sqliteOptionsForEnv(env),
  );
}
