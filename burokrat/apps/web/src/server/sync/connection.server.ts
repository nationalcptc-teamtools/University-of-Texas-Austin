import {
  bytesToHex,
  encode,
  JoinErrorCode,
  MessageType,
  RoomErrorCode,
  tryDecode,
  UpdateStatusCode,
  type CrdtType,
  type HexString,
  type JoinRequest,
  type ProtocolMessage,
} from "loro-protocol";
import type { Peer as Socket } from "crossws";
import type { Session } from "../sealed-session.server.ts";
import { FragmentAssembler, type FragmentFailure } from "./fragments.server.ts";
import { ack, rejoinSuggested, type Peer, type Room } from "./peer.server.ts";
import { roomKey, type RoomRegistry } from "./rooms.server.ts";
import { TokenBucket } from "./token-bucket.server.ts";

const MAX_UPDATE_BYTES = 4 * 1024 * 1024;
const MAX_ROOMS = 32;
const FRAGMENT_SIZE = 240 * 1024;
const RATE_PER_SECOND = 50;
const RATE_BURST = 200;

const FRAGMENT_STATUS: Record<FragmentFailure, UpdateStatusCode> = {
  "too-large": UpdateStatusCode.PayloadTooLarge,
  timeout: UpdateStatusCode.FragmentTimeout,
  invalid: UpdateStatusCode.InvalidUpdate,
};

const newBatchId = () => bytesToHex(crypto.getRandomValues(new Uint8Array(8)));

/** One client socket speaking `loro-protocol`. */
export class Connection implements Peer {
  private rooms = new Map<string, Room>();
  private rate = new TokenBucket(RATE_PER_SECOND, RATE_BURST);
  private fragments = new FragmentAssembler(
    MAX_UPDATE_BYTES,
    ({ crdt, roomId, batchId }, failure) =>
      this.send(ack(crdt, roomId, batchId, FRAGMENT_STATUS[failure])),
  );

  constructor(
    private socket: Socket,
    private session: Session,
    private registry: RoomRegistry,
  ) {}

  get name() {
    return this.session.name;
  }

  send(message: ProtocolMessage) {
    if (this.socket.websocket.readyState === WebSocket.OPEN) this.socket.send(encode(message));
  }

  sendUpdate(crdt: CrdtType, roomId: string, update: Uint8Array) {
    const batchId = newBatchId();
    if (update.length <= FRAGMENT_SIZE) {
      return this.send({ type: MessageType.DocUpdate, crdt, roomId, updates: [update], batchId });
    }
    const fragmentCount = Math.ceil(update.length / FRAGMENT_SIZE);
    const header = { crdt, roomId, batchId, fragmentCount, totalSizeBytes: update.length };
    this.send({ type: MessageType.DocUpdateFragmentHeader, ...header });
    for (let index = 0; index < fragmentCount; index++) {
      const fragment = update.subarray(index * FRAGMENT_SIZE, (index + 1) * FRAGMENT_SIZE);
      this.send({ type: MessageType.DocUpdateFragment, crdt, roomId, batchId, index, fragment });
    }
  }

  evict(crdt: CrdtType, roomId: string, message: string) {
    this.send({ type: MessageType.RoomError, crdt, roomId, code: RoomErrorCode.Evicted, message });
    this.leave(crdt, roomId);
  }

  /** Text frames are keepalive pings; binary frames carry the protocol. */
  receive(data: string | Uint8Array) {
    if (typeof data === "string") {
      if (data === "ping") this.socket.send("pong");
      return;
    }
    const message = tryDecode(data);
    if (!message) return this.socket.close(1003, "Malformed message");
    const costly =
      message.type === MessageType.DocUpdate ||
      message.type === MessageType.DocUpdateFragmentHeader ||
      message.type === MessageType.DocUpdateFragment;
    if (costly && !this.rate.take()) return this.rateLimited(message);
    switch (message.type) {
      case MessageType.JoinRequest:
        return this.join(message);
      case MessageType.DocUpdate:
        return this.update(message.crdt, message.roomId, message.batchId, message.updates);
      case MessageType.DocUpdateFragmentHeader:
        return this.fragments.start(message);
      case MessageType.DocUpdateFragment: {
        const assembled = this.fragments.add(message);
        if (!assembled) return;
        const { crdt, roomId, batchId } = assembled.header;
        return this.update(crdt, roomId, batchId, [assembled.update]);
      }
      case MessageType.Leave:
        return this.leave(message.crdt, message.roomId);
    }
  }

  /** The update is dropped, so a doc client is asked to rejoin and resend what the server lacks. */
  private rateLimited(message: ProtocolMessage) {
    if (message.type !== MessageType.DocUpdate) return;
    const { crdt, roomId, batchId } = message;
    this.send(ack(crdt, roomId, batchId, UpdateStatusCode.RateLimited));
    if (crdt === "%LOR") this.send(rejoinSuggested(crdt, roomId));
  }

  private join({ crdt, roomId, version }: JoinRequest) {
    const reject = (code: JoinErrorCode, message: string) =>
      this.send({ type: MessageType.JoinError, crdt, roomId, code, message });
    const key = roomKey(crdt, roomId);
    if (!this.rooms.has(key) && this.rooms.size >= MAX_ROOMS) {
      return reject(JoinErrorCode.AppError, "Too many open rooms");
    }
    let result: ReturnType<RoomRegistry["join"]>;
    try {
      result = this.registry.join(crdt, roomId, this, version);
    } catch {
      return reject(JoinErrorCode.VersionUnknown, "Unreadable version");
    }
    if (!result) return reject(JoinErrorCode.AppError, "No such room");
    const { room, joined } = result;
    this.rooms.set(key, room);
    this.send({
      type: MessageType.JoinResponseOk,
      crdt,
      roomId,
      permission: "write",
      version: joined.version,
    });
    if (joined.missing) this.sendUpdate(crdt, roomId, joined.missing);
  }

  private update(crdt: CrdtType, roomId: string, batchId: HexString, updates: Uint8Array[]) {
    const room = this.rooms.get(roomKey(crdt, roomId));
    if (!room) return this.send(ack(crdt, roomId, batchId, UpdateStatusCode.PermissionDenied));
    if (updates.reduce((size, update) => size + update.length, 0) > MAX_UPDATE_BYTES) {
      return this.send(ack(crdt, roomId, batchId, UpdateStatusCode.PayloadTooLarge));
    }
    room.apply(this, batchId, updates);
  }

  private leave(crdt: CrdtType, roomId: string) {
    if (this.rooms.delete(roomKey(crdt, roomId))) this.registry.leave(crdt, roomId, this);
  }

  closed() {
    this.fragments.clear();
    for (const room of [...this.rooms.values()]) this.leave(room.crdt, room.roomId);
  }
}
