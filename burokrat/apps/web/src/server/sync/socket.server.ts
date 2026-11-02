import type { Hooks, Peer as Socket } from "crossws";
import { parseCookies } from "h3";
import { MAX_MESSAGE_SIZE } from "loro-protocol";
import { COOKIE, readSession, type Session } from "../sealed-session.server.ts";
import { Connection } from "./connection.server.ts";
import { RoomRegistry } from "./rooms.server.ts";

const HEARTBEAT_MS = 30_000;

/** Browsers always send Origin on a WebSocket handshake; a foreign one is a cross-site attempt. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function authenticate(request: Request) {
  if (!sameOrigin(request)) return null;
  try {
    return await readSession(parseCookies({ req: request })[COOKIE]);
  } catch {
    return null;
  }
}

/** Serves `loro-protocol` through crossws hooks. */
export function createSyncServer() {
  const registry = new RoomRegistry();
  const connections = new Map<Socket, Connection>();
  const alive = new WeakSet<Socket>();

  const hooks: Partial<Hooks> = {
    async upgrade(request) {
      const session = await authenticate(request);
      if (!session) return new Response("Unauthorized", { status: 401 });
      return { context: { session } };
    },
    open(socket) {
      alive.add(socket);
      connections.set(socket, new Connection(socket, socket.context.session as Session, registry));
    },
    message(socket, message) {
      const data = typeof message.rawData === "string" ? message.rawData : message.uint8Array();
      if (data.length > MAX_MESSAGE_SIZE) return socket.close(1009, "Too big");
      connections.get(socket)?.receive(data);
    },
    pong(socket) {
      alive.add(socket);
    },
    close(socket) {
      connections.get(socket)?.closed();
      connections.delete(socket);
    },
  };

  const heartbeat = setInterval(() => {
    for (const socket of connections.keys()) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, HEARTBEAT_MS).unref();

  return {
    hooks,
    /** Disconnects everyone and writes every open doc's snapshot. */
    close() {
      clearInterval(heartbeat);
      for (const socket of connections.keys()) socket.terminate();
      connections.clear();
      registry.closeAll();
    },
  };
}
