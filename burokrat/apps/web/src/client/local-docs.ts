import { clear, createStore, del, get, set } from "idb-keyval";
import type { LoroDoc, VersionVector } from "loro-crdt";

const store = createStore("burokrat-docs", "docs");
const SAVE_DELAY_MS = 500;
/** Changes not yet in IndexedDB when the page went away, which can't wait for an async write. */
const UNSAVED = "burokrat-docs:";

const ignore = () => {};

function readUnsaved(roomId: string) {
  try {
    const text = atob(localStorage.getItem(UNSAVED + roomId) ?? "");
    return text ? Uint8Array.from(text, (char) => char.charCodeAt(0)) : undefined;
  } catch {
    return undefined;
  }
}

function writeUnsaved(roomId: string, update: Uint8Array) {
  try {
    localStorage.setItem(
      UNSAVED + roomId,
      btoa(Array.from(update, (byte) => String.fromCharCode(byte)).join("")),
    );
  } catch {
    // Without storage, only what IndexedDB saved in time is kept.
  }
}

function forgetUnsaved(roomId?: string) {
  try {
    const keys = roomId ? [UNSAVED + roomId] : Object.keys(localStorage);
    for (const key of keys) if (key.startsWith(UNSAVED)) localStorage.removeItem(key);
  } catch {
    // Nothing was saved.
  }
}

export const forgetLocalCopy = (roomId: string) => {
  forgetUnsaved(roomId);
  return del(roomId, store).catch(ignore);
};

export const forgetLocalCopies = () => {
  forgetUnsaved();
  return clear(store).catch(ignore);
};

/** Imports this device's copy of a doc into `doc`, and says whether there was one. */
export async function loadLocalCopy(roomId: string, doc: LoroDoc) {
  const snapshot = await get<Uint8Array>(roomId, store).catch(ignore);
  const unsaved = readUnsaved(roomId);
  if (snapshot) doc.import(snapshot);
  if (unsaved) {
    doc.import(unsaved);
    await set(roomId, doc.export({ mode: "snapshot" }), store).then(
      () => forgetUnsaved(roomId),
      ignore,
    );
  }
  return Boolean(snapshot || unsaved);
}

/**
 * Saves `doc` to this device shortly after each change, local or synced, and as the page goes
 * away, so closing a tab offline keeps the last keystrokes.
 */
export function keepLocalCopy(roomId: string, doc: LoroDoc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saved: VersionVector = doc.oplogVersion();
  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    const version = doc.oplogVersion();
    void set(roomId, doc.export({ mode: "snapshot" }), store).then(() => (saved = version), ignore);
  };
  const flush = () => timer && save();
  // IndexedDB may not finish writing before the page is gone, so the changes it lacks are kept too.
  const leave = () => {
    if (timer) writeUnsaved(roomId, doc.export({ mode: "update", from: saved }));
    flush();
  };
  const unsubscribe = doc.subscribe(() => {
    timer ??= setTimeout(save, SAVE_DELAY_MS);
  });
  addEventListener("pagehide", leave);
  return {
    /** Stops saving, after saving any change still waiting. */
    stop() {
      unsubscribe();
      removeEventListener("pagehide", leave);
      flush();
    },
    /** Stops saving and deletes the copy, for a doc the server deleted or refused changes to. */
    forget() {
      unsubscribe();
      removeEventListener("pagehide", leave);
      clearTimeout(timer);
      return forgetLocalCopy(roomId);
    },
  };
}
