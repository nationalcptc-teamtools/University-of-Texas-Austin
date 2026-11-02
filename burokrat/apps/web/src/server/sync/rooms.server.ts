import type { CrdtType } from "loro-protocol";
import { liveProject } from "../projects.server.ts";
import { DocRoom } from "./doc-room.server.ts";
import { EphemeralRoom } from "./ephemeral-room.server.ts";
import type { Peer, Room } from "./peer.server.ts";
import { projectName } from "./projector.server.ts";
import { loadDoc } from "./storage.server.ts";

const IDLE_CLOSE_MS = 30_000;
const ROOM_ID = /^project:([\w-]{21})$/;

export const roomKey = (crdt: CrdtType, roomId: string) => `${crdt}:${roomId}`;

/** The project a room id such as `project:<nanoid>` names, if it names a live one. */
function projectOf(roomId: string) {
  const projectId = ROOM_ID.exec(roomId)?.[1];
  return projectId && liveProject(projectId) ? projectId : undefined;
}

function create(crdt: CrdtType, roomId: string, projectId: string): Room | undefined {
  if (crdt === "%EPH") return new EphemeralRoom(roomId);
  if (crdt !== "%LOR") return undefined;
  const stored = loadDoc(projectId);
  if (!stored) return undefined;
  return new DocRoom(roomId, projectId, stored, (doc) => projectName(projectId, doc));
}

/** Every open room in this process. Rooms load on first join and close when idle. */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private idleTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Adds the peer to the room, loading it if needed; `undefined` when the room doesn't exist or
   * isn't open to joins. A join that throws leaves the room to close once idle.
   */
  join(crdt: CrdtType, roomId: string, peer: Peer, version: Uint8Array) {
    const projectId = projectOf(roomId);
    if (!projectId) return undefined;
    const key = roomKey(crdt, roomId);
    const room = this.rooms.get(key) ?? create(crdt, roomId, projectId);
    if (!room) return undefined;
    this.rooms.set(key, room);
    clearTimeout(this.idleTimers.get(key));
    this.idleTimers.delete(key);
    try {
      return { room, joined: room.join(peer, version) };
    } finally {
      this.closeWhenIdle(key, room);
    }
  }

  leave(crdt: CrdtType, roomId: string, peer: Peer) {
    const key = roomKey(crdt, roomId);
    const room = this.rooms.get(key);
    if (!room?.members.has(peer)) return;
    room.leave(peer);
    this.closeWhenIdle(key, room);
  }

  private closeWhenIdle(key: string, room: Room) {
    if (room.members.size > 0) return;
    this.idleTimers.set(key, setTimeout(() => this.close(key), IDLE_CLOSE_MS).unref());
  }

  private close(key: string) {
    clearTimeout(this.idleTimers.get(key));
    this.idleTimers.delete(key);
    this.rooms.get(key)?.close();
    this.rooms.delete(key);
  }

  closeAll() {
    for (const key of [...this.rooms.keys()]) this.close(key);
  }
}
