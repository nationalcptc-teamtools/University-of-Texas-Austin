import { createSyncServer } from "./socket.server.ts";

type SyncServer = ReturnType<typeof createSyncServer>;
const shared = globalThis as typeof globalThis & { burokratSync?: SyncServer };

// A dev reload runs this module again: the old server saves its docs and drops its clients first.
shared.burokratSync?.close();
export const sync = (shared.burokratSync = createSyncServer());

/** Closes whichever sync server is current, so a reloaded one is saved too. */
export function closeSync() {
  shared.burokratSync?.close();
}
