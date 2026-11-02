import { PRESENCE_TIMEOUT_MS } from "@burokrat/domain";
import { EphemeralStore, type Value } from "loro-crdt";
import { UpdateStatusCode, type HexString } from "loro-protocol";
import { ack, type Joined, type Peer, type Room } from "./peer.server.ts";

/**
 * One `%EPH` room. The server keeps the presence state so late joiners get it at once, and
 * removes a peer's keys when it leaves: a reloaded tab never gets to delete its own. A key belongs
 * to the user who first set it; another user's update to it is undone.
 */
export class EphemeralRoom implements Room {
  readonly crdt = "%EPH";
  readonly members = new Set<Peer>();
  private store = new EphemeralStore(PRESENCE_TIMEOUT_MS);
  private owners = new Map<string, Peer>();
  private imported: { key: string; removed: boolean }[] = [];

  constructor(readonly roomId: string) {
    this.store.subscribe((event) => {
      if (event.by === "import") {
        for (const key of [...event.added, ...event.updated])
          this.imported.push({ key, removed: false });
        for (const key of event.removed) this.imported.push({ key, removed: true });
      } else {
        for (const key of event.removed) this.owners.delete(key);
      }
    });
    this.store.subscribeLocalUpdates((update) => this.broadcast(undefined, [update]));
  }

  /** Adds the peer and sends it the current state, if any. Presence has no version. */
  join(peer: Peer): Joined {
    this.members.add(peer);
    const missing = this.store.keys().length > 0 ? this.store.encodeAll() : undefined;
    return { version: new Uint8Array(), missing };
  }

  apply(peer: Peer, batchId: HexString, updates: Uint8Array[]) {
    const valid = this.import(peer, updates);
    const status = valid ? UpdateStatusCode.Ok : UpdateStatusCode.InvalidUpdate;
    peer.send(ack(this.crdt, this.roomId, batchId, status));
  }

  private import(peer: Peer, updates: Uint8Array[]) {
    const before = this.store.getAllStates();
    this.imported = [];
    try {
      for (const update of updates) this.store.apply(update);
    } catch {
      return false;
    }
    const foreign = this.imported.filter(({ key }) => {
      const owner = this.owners.get(key);
      return owner !== undefined && owner.name !== peer.name;
    });
    if (foreign.length > 0) {
      for (const { key } of foreign) this.restore(key, before[key]);
      return false;
    }
    for (const { key, removed } of this.imported) {
      if (removed) this.owners.delete(key);
      else this.owners.set(key, peer);
    }
    this.broadcast(peer, updates);
    return true;
  }

  /** Puts a key back as it was, and sends that to every member. */
  private restore(key: string, value: Value | undefined) {
    if (value === undefined) this.store.delete(key);
    else this.store.set(key, value);
  }

  leave(peer: Peer) {
    this.members.delete(peer);
    for (const [key, owner] of [...this.owners]) if (owner === peer) this.store.delete(key);
  }

  private broadcast(from: Peer | undefined, updates: Uint8Array[]) {
    for (const member of this.members) {
      if (member === from) continue;
      for (const update of updates) member.sendUpdate("%EPH", this.roomId, update);
    }
  }

  close() {
    this.store.destroy();
  }
}
