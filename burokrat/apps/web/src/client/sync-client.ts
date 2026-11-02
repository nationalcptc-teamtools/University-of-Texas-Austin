import { PRESENCE_TIMEOUT_MS } from "@burokrat/domain";
import { LoroDoc } from "loro-crdt";
import { LoroAdaptor, LoroEphemeralAdaptor } from "loro-adaptors/loro";
import { LoroWebsocketClient } from "loro-websocket";
import { keepLocalCopy, loadLocalCopy } from "./local-docs.ts";
import { recordAuthor } from "./history/versions.ts";
import { Presence } from "./presence.ts";
import { UndoRegistry } from "./undo-registry.ts";

let client: LoroWebsocketClient | undefined;

/** One socket per tab, kept for the tab's lifetime: `destroy()` throws before it connects. */
export function syncClient() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  client ??= new LoroWebsocketClient({ url: `${protocol}://${location.host}/sync` });
  return client;
}

type JoinOptions = Parameters<LoroWebsocketClient["join"]>[0];

const REJOIN_DELAY_MS = 1_000;

function connected() {
  return new Promise<void>((resolve) => {
    const off = syncClient().onStatusChange((status) => {
      if (status !== "connected") return;
      resolve();
      queueMicrotask(() => off());
    });
  });
}

/**
 * Joins a room, again and again if the socket drops before the server answers: the client gives
 * up on a join it was waiting on when that happens. Rejects only when the server refuses, which
 * the room's status reports as "error".
 */
async function joinUntilAnswered(options: JoinOptions) {
  for (;;) {
    let refused = false;
    try {
      return await syncClient().join({
        ...options,
        onStatusChange: (status) => {
          refused ||= status === "error";
          options.onStatusChange?.(status);
        },
      });
    } catch (error) {
      if (refused) throw error;
      await connected();
      await new Promise((resolve) => setTimeout(resolve, REJOIN_DELAY_MS));
    }
  }
}

const released = new Map<string, Promise<void>>();

/**
 * Joins a room once every earlier handle on it has left: the client answers a second join of the
 * same room with the first join's room, adaptor and all.
 */
async function joinRoom(options: JoinOptions) {
  const id = options.crdtAdaptor.crdtType + options.roomId;
  const previous = released.get(id);
  let release!: () => void;
  const left = new Promise<void>((resolve) => (release = resolve));
  const chain = previous ? previous.then(() => left) : left;
  released.set(id, chain);
  const leave = () => {
    release();
    if (released.get(id) === chain) released.delete(id);
  };
  await previous;
  try {
    const room = await joinUntilAnswered(options);
    return { room, leave: () => room.destroy().finally(leave) };
  } catch (error) {
    leave();
    throw error;
  }
}

/** Joins a presence room, now or once the socket connects. Leaving it deletes our keys. */
export function joinPresence(roomId: string, presence = new Presence()) {
  const joining = joinRoom({ roomId, crdtAdaptor: new LoroEphemeralAdaptor(presence.store) });
  const timer = setInterval(() => presence.refresh(), PRESENCE_TIMEOUT_MS / 3);
  return {
    presence,
    leave() {
      clearInterval(timer);
      presence.clear();
      void joining.then(
        ({ leave }) => leave(),
        () => {},
      );
    },
  };
}

export type DocSession = {
  doc: LoroDoc;
  presence: Presence;
  undo: UndoRegistry;
  close(): void;
};

/**
 * Opens a synced doc and its presence room. With a copy on this device it resolves at once and
 * syncs in the background, sending the server any changes made offline; otherwise it resolves
 * once the server's copy has arrived. Each change made in it is stamped with `author`.
 * `onRemoved` runs when the server evicts us, for example because an edit was refused, after this
 * device's copy is deleted.
 */
export async function openDoc(
  roomId: string,
  author: string,
  onRemoved: () => void,
): Promise<DocSession> {
  const doc = new LoroDoc();
  const stopRecording = recordAuthor(doc, author);
  const local = await loadLocalCopy(roomId, doc);
  const copy = keepLocalCopy(roomId, doc);
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    void copy.forget().then(onRemoved);
  };
  const joining = joinRoom({
    roomId,
    crdtAdaptor: new LoroAdaptor(doc),
    onStatusChange: (status) => status === "error" && remove(),
  });
  const presence = joinPresence(roomId);
  const undo = new UndoRegistry(doc);
  const close = () => {
    presence.leave();
    void joining.then(
      ({ leave }) => leave(),
      () => {},
    );
    copy.stop();
    undo.free();
    stopRecording();
  };
  try {
    // A refusal shows in the room's status, which calls `remove`.
    if (local) joining.catch(() => {});
    else await (await joining).room.waitForReachingServerVersion();
  } catch (error) {
    close();
    throw error;
  }
  return { doc, presence: presence.presence, undo, close };
}
