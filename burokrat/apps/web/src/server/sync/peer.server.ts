import {
  MessageType,
  RoomErrorCode,
  type CrdtType,
  type HexString,
  type ProtocolMessage,
  type UpdateStatusCode,
} from "loro-protocol";

/** A connection as rooms see it. */
export interface Peer {
  readonly name: string;
  send(message: ProtocolMessage): void;
  sendUpdate(crdt: CrdtType, roomId: string, update: Uint8Array): void;
  /** Removes the peer from the room and tells its client why. */
  evict(crdt: CrdtType, roomId: string, message: string): void;
}

export const ack = (
  crdt: CrdtType,
  roomId: string,
  refId: HexString,
  status: UpdateStatusCode,
): ProtocolMessage => ({ type: MessageType.Ack, crdt, roomId, refId, status });

/** Asks a doc client to rejoin, which resends whatever the server is missing. */
export const rejoinSuggested = (crdt: CrdtType, roomId: string): ProtocolMessage => ({
  type: MessageType.RoomError,
  crdt,
  roomId,
  code: RoomErrorCode.RejoinSuggested,
  message: "Rejoin to resync",
});

/** What a joining peer is sent: the room's version, and the state it lacks. */
export type Joined = { version: Uint8Array; missing?: Uint8Array };

/** An open room of either kind. */
export interface Room {
  readonly crdt: CrdtType;
  readonly roomId: string;
  readonly members: Set<Peer>;
  /** Adds the peer. Throws on a version it cannot read, leaving the peer out. */
  join(peer: Peer, version: Uint8Array): Joined;
  /** Applies a peer's updates and acknowledges them, evicting the peer if it must. */
  apply(peer: Peer, batchId: HexString, updates: Uint8Array[]): void;
  leave(peer: Peer): void;
  close(): void;
}
