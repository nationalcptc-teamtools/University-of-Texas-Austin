import { useSyncExternalStore } from "react";
import { syncClient } from "./sync-client.ts";

/**
 * "offline" once the sync socket has been down for a moment, so a blip goes unnoticed, and
 * "reconnected" for a moment after it comes back.
 */
export type Connection = "online" | "offline" | "reconnected";

/** How long the socket may be down before the app says so. */
const GRACE_MS = 3_000;
/** How long "reconnected" shows. */
const RECONNECTED_MS = 3_000;

let connection: Connection = "online";
let grace: ReturnType<typeof setTimeout> | undefined;
let reconnected: ReturnType<typeof setTimeout> | undefined;
let watching = false;
const listeners = new Set<() => void>();

function set(next: Connection) {
  connection = next;
  for (const listener of listeners) listener();
}

function watch() {
  watching = true;
  syncClient().onStatusChange((status) => {
    if (status !== "connected") {
      // Retries pass through "connecting" without ending the outage.
      if (connection !== "offline") {
        grace ??= setTimeout(() => {
          grace = undefined;
          clearTimeout(reconnected);
          set("offline");
        }, GRACE_MS);
      }
      return;
    }
    clearTimeout(grace);
    grace = undefined;
    if (connection !== "offline") return;
    set("reconnected");
    reconnected = setTimeout(() => set("online"), RECONNECTED_MS);
  });
}

function subscribe(listener: () => void) {
  if (!watching) watch();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnection() {
  return useSyncExternalStore(
    subscribe,
    () => connection,
    () => "online" as const,
  );
}

/** False while offline, for actions that need the server. */
export const useOnline = () => useConnection() !== "offline";
