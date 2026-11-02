import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REPORT_TEMPLATE,
  writeCredential,
  writeFinding,
  writeMachine,
  type CredentialEntry,
  type MachineEntry,
} from "@burokrat/domain";
import { FINDING_TEMPLATES } from "@burokrat/domain/finding-templates";
import { eq } from "drizzle-orm";
import { EphemeralStore, LoroDoc, type LoroMap } from "loro-crdt";
import { LoroAdaptor, LoroEphemeralAdaptor } from "loro-adaptors/loro";
import { MessageType, RoomErrorCode, tryDecode, type RoomError } from "loro-protocol";
import { LoroWebsocketClient } from "loro-websocket";
import nodeAdapter from "crossws/adapters/node";
import { nanoid } from "nanoid";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { WebSocket as NodeWebSocket } from "ws";

const dataDir = mkdtempSync(join(tmpdir(), "burokrat-sync-"));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

const { getDb, migrateDatabase } = await import("../db.server.ts");
const { createProject } = await import("../projects.server.ts");
const { docUpdates, docs, projects } = await import("../schema.ts");
const { COOKIE, sealSession } = await import("../sealed-session.server.ts");
const { createSyncServer } = await import("./socket.server.ts");
const { RoomRegistry } = await import("./rooms.server.ts");

let cookie = "";
const roomErrors: RoomError[] = [];
let fragmentHeaders = 0;
class CookieWebSocket extends NodeWebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols, { headers: { cookie } });
    this.on("message", (data: Buffer, isBinary: boolean) => {
      const message = isBinary ? tryDecode(new Uint8Array(data)) : undefined;
      if (message?.type === MessageType.RoomError) roomErrors.push(message);
      if (message?.type === MessageType.DocUpdateFragmentHeader) fragmentHeaders++;
    });
  }
}
globalThis.WebSocket = CookieWebSocket as unknown as typeof WebSocket;

let server: Server;
let sync: ReturnType<typeof serveSync>;
let url: string;
let projectId: string;
const clients: LoroWebsocketClient[] = [];

/** What Nitro does for the `/sync` route, on a bare HTTP server. */
function serveSync() {
  const syncServer = createSyncServer();
  const adapter = nodeAdapter({ hooks: syncServer.hooks });
  const handleUpgrade: Parameters<Server["on"]>[1] = (req, socket, head) =>
    adapter.handleUpgrade(req, socket, head);
  server.on("upgrade", handleUpgrade);
  return {
    close() {
      server.off("upgrade", handleUpgrade);
      syncServer.close();
    },
  };
}

beforeAll(async () => {
  migrateDatabase();
  server = createServer();
  sync = serveSync();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${(server.address() as AddressInfo).port}/sync`;
  projectId = newProject().id;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
});

afterAll(async () => {
  sync.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
});

async function connect(name: string) {
  cookie = `${COOKIE}=${encodeURIComponent(await sealSession({ name }))}`;
  const client = new LoroWebsocketClient({ url });
  clients.push(client);
  await client.waitConnected();
  return client;
}

const FINDING_ID = "aaaaaaaaaaaaaaaaaaaaa";
const entry = {
  ...FINDING_TEMPLATES[0]!,
  targets: {},
  owner: "alice",
  createdBy: "alice",
  createdAt: 1,
  deleted: false,
};
const machine: MachineEntry = {
  ip: "10.0.0.23",
  hostname: "",
  os: "",
  status: "untouched",
  scope: "in",
  scopeNote: "",
  claimedAt: 0,
  services: {},
  notes: "",
  owner: "",
  createdBy: "mallory",
  createdAt: 1,
  deleted: false,
};
const credential: CredentialEntry = {
  username: "svc_sql",
  domain: "CORP",
  secret: "Summer2026!",
  type: "password",
  source: "",
  works: {},
  note: "",
  createdBy: "mallory",
  createdAt: 1,
  deleted: false,
};
const roomOf = (projectId: string) => `project:${projectId}`;

/** A project holding one finding, {@link FINDING_ID}. */
const newProject = () =>
  createProject({
    project: { name: "Test", companyName: "Acme", teamName: "Team-01" },
    findings: { [FINDING_ID]: entry },
    machines: {},
    assets: {},
    credentials: {},
    engage: { outOfScope: "", notes: "" },
    report: REPORT_TEMPLATE,
  });

async function openProject(name: string, projectId: string) {
  const client = await connect(name);
  const doc = new LoroDoc();
  const room = await client.join({ roomId: roomOf(projectId), crdtAdaptor: new LoroAdaptor(doc) });
  await room.waitForReachingServerVersion();
  const findings = doc.getMap("findings");
  return { client, doc, findings, root: findings.get(FINDING_ID) as LoroMap };
}

const text = (root: LoroMap, field: string) => root.ensureMergeableText(field);
const evicted = (projectId: string) =>
  roomErrors.some(
    (error) => error.roomId === roomOf(projectId) && error.code === RoomErrorCode.Evicted,
  );
const journal = (projectId: string) =>
  getDb().select().from(docUpdates).where(eq(docUpdates.docId, projectId)).all();

describe("upgrade", () => {
  const handshake = (headers: Record<string, string>) =>
    new Promise<number>((resolve) => {
      const ws = new NodeWebSocket(url, { headers });
      ws.on("open", () => resolve(101));
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve(0));
    });

  it("rejects a missing or forged session", async () => {
    expect(await handshake({})).toBe(401);
    expect(await handshake({ cookie: `${COOKIE}=forged` })).toBe(401);
  });

  it("rejects a foreign origin", async () => {
    const valid = `${COOKIE}=${encodeURIComponent(await sealSession({ name: "eve" }))}`;
    expect(await handshake({ cookie: valid, origin: "https://evil.example" })).toBe(401);
    expect(await handshake({ cookie: valid })).toBe(101);
  });
});

describe("project rooms", () => {
  it("syncs two editors, journals the edits and copies the name to the project list", async () => {
    const { id } = newProject();
    const alice = await openProject("alice", id);
    const bob = await openProject("bob", id);
    expect(text(bob.root, "description").toString()).toBe(FINDING_TEMPLATES[0]!.description);

    text(alice.root, "title").update("Renamed");
    alice.root.set("impact", 1);
    writeFinding(alice.findings, nanoid(), { ...entry, createdAt: 2 });
    alice.doc.getMap("project").set("name", "Renamed project");
    alice.doc.commit();
    await vi.waitFor(() => expect(text(bob.root, "title").toString()).toBe("Renamed"));
    expect(bob.root.get("impact")).toBe(1);
    expect(bob.findings.size).toBe(2);
    expect(journal(id).map((update) => update.author)).toEqual(["alice"]);

    await vi.waitFor(() => {
      const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
      expect(row?.name).toBe("Renamed project");
    });
  });

  it("compacts the journal into the snapshot and reloads from it", async () => {
    const { id } = newProject();
    const alice = await openProject("alice", id);
    alice.doc.getMap("report").ensureMergeableText("prologue").update("Hello.");
    alice.doc.commit();
    await vi.waitFor(() => expect(journal(id)).toHaveLength(1));

    sync.close();
    sync = serveSync();
    expect(journal(id)).toHaveLength(0);
    const snapshot = getDb()
      .select({ snapshot: docs.snapshot })
      .from(docs)
      .where(eq(docs.id, id))
      .get()!.snapshot;
    expect(LoroDoc.fromSnapshot(snapshot).toJSON().report.prologue).toBe("Hello.");

    const carol = await openProject("carol", id);
    expect(carol.doc.getMap("report").ensureMergeableText("prologue").toString()).toBe("Hello.");
  });

  it("evicts a client that writes an invalid doc and keeps the update out", async () => {
    const { id } = newProject();
    const mallory = await openProject("mallory", id);
    const bob = await openProject("bob", id);
    mallory.root.set("impact", 9);
    mallory.doc.commit();
    await vi.waitFor(() => expect(evicted(id)).toBe(true));

    text(bob.root, "title").update("Still fine");
    bob.doc.commit();
    await vi.waitFor(() => expect(journal(id)).toHaveLength(1));
    const carol = await openProject("carol", id);
    expect(carol.root.get("impact")).toBe(FINDING_TEMPLATES[0]!.impact);
    expect(text(carol.root, "title").toString()).toBe("Still fine");
    expect(journal(id).map((update) => update.author)).toEqual(["bob"]);
  });

  it("closes a room once idle even if its only join failed", () => {
    const registry = new RoomRegistry();
    const peer = { name: "alice", send() {}, sendUpdate() {}, evict() {} };
    vi.useFakeTimers();
    try {
      expect(() =>
        registry.join("%LOR", roomOf(newProject().id), peer, new Uint8Array([255, 255])),
      ).toThrow();
      vi.advanceTimersByTime(30_000);
      expect(registry["rooms"].size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks edits inside a field against that field's schema", async () => {
    const { id } = newProject();
    const mallory = await openProject("mallory", id);
    text(mallory.root, "title").insert(0, "x".repeat(501));
    mallory.doc.commit();
    await vi.waitFor(() => expect(evicted(id)).toBe(true));
    expect(journal(id)).toHaveLength(0);
  });

  it("accepts credentials and the team's notes", async () => {
    const { id } = newProject();
    const alice = await openProject("alice", id);
    writeCredential(alice.doc.getMap("credentials"), nanoid(), credential);
    alice.doc.getMap("engage").ensureMergeableText("notes").insert(0, "DA via kerberoast");
    alice.doc.commit();
    await vi.waitFor(() => expect(journal(id)).toHaveLength(1));
    expect(evicted(id)).toBe(false);
  });

  it.each([
    ["removes a finding", (findings: LoroMap) => findings.delete(FINDING_ID)],
    ["adds a finding under a malformed id", (f: LoroMap) => writeFinding(f, "short", entry)],
    ["adds an incomplete finding", (f: LoroMap) => f.ensureMergeableMap(nanoid()).set("x", 1)],
    [
      "adds a machine with an unknown status",
      (_: LoroMap, doc: LoroDoc) =>
        writeMachine(doc.getMap("machines"), nanoid(), { ...machine, status: "pwned" as "owned" }),
    ],
    [
      "adds a credential with an unknown type",
      (_: LoroMap, doc: LoroDoc) =>
        writeCredential(doc.getMap("credentials"), nanoid(), {
          ...credential,
          type: "cookie" as "other",
        }),
    ],
    [
      "writes past the length of the excluded addresses",
      (_: LoroMap, doc: LoroDoc) =>
        doc.getMap("engage").ensureMergeableText("outOfScope").insert(0, "1".repeat(10_001)),
    ],
  ])("evicts a client that %s", async (_, edit) => {
    const { id } = newProject();
    const mallory = await openProject("mallory", id);
    edit(mallory.findings, mallory.doc);
    mallory.doc.commit();
    await vi.waitFor(() => expect(evicted(id)).toBe(true));
    expect(journal(id)).toHaveLength(0);
  });

  it("refuses rooms that are not a live project", async () => {
    const client = await connect("alice");
    const join = (roomId: string) =>
      client.join({ roomId, crdtAdaptor: new LoroAdaptor(new LoroDoc()) });
    await expect(join("project:000000000000000000000")).rejects.toThrow();
    await expect(join(`finding:${projectId}`)).rejects.toThrow();
    await expect(join("../etc/passwd")).rejects.toThrow();
  });

  it("fragments large updates in both directions", async () => {
    const { id } = newProject();
    const alice = await openProject("alice", id);
    const bob = await openProject("bob", id);
    const fields = ["description", "businessImpact", "exploitDetails", "remediation"];
    fragmentHeaders = 0;
    for (const field of fields) {
      const value = text(alice.root, field);
      value.delete(0, value.length);
      value.insert(0, randomBytes(67_000).toString("base64"));
    }
    alice.doc.commit();
    const same = () => JSON.stringify(bob.doc.toJSON()) === JSON.stringify(alice.doc.toJSON());
    await vi.waitFor(() => expect(same()).toBe(true), { timeout: 5_000 });
    expect(journal(id)[0]!.bytes.length).toBeGreaterThan(256 * 1024);
    expect(fragmentHeaders).toBeGreaterThan(0);
  });

  it("recovers from rate limiting by rejoining", async () => {
    const { id } = newProject();
    const alice = await openProject("alice", id);
    const title = text(alice.root, "title");
    for (let i = 0; i < 400; i++) {
      title.insert(title.length, "x");
      alice.doc.commit();
    }
    const bob = await openProject("bob", id);
    await vi.waitFor(() => expect(text(bob.root, "title").toString()).toBe(title.toString()), {
      timeout: 5_000,
    });
    const rejoins = roomErrors.filter(
      (error) => error.roomId === roomOf(id) && error.code === RoomErrorCode.RejoinSuggested,
    );
    expect(rejoins.length).toBeGreaterThan(0);
  });
});

describe("presence rooms", () => {
  const join = async (name: string) => {
    const client = await connect(name);
    const store = new EphemeralStore(30_000);
    await client.join({
      roomId: roomOf(projectId),
      crdtAdaptor: new LoroEphemeralAdaptor(store),
    });
    return { client, store };
  };

  it("relays presence and hands the current state to late joiners", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    alice.store.set("alice", { findingId: FINDING_ID });
    await vi.waitFor(() => expect(bob.store.get("alice")).toEqual({ findingId: FINDING_ID }));
    const carol = await join("carol");
    await vi.waitFor(() => expect(carol.store.get("alice")).toEqual({ findingId: FINDING_ID }));
  });

  it("drops a peer's presence when it disconnects", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    alice.store.set("alice-tab", { findingId: null });
    await vi.waitFor(() => expect(bob.store.get("alice-tab")).toBeDefined());
    alice.client.destroy();
    await vi.waitFor(() => expect(bob.store.get("alice-tab")).toBeUndefined());
    const carol = await join("carol");
    expect(carol.store.get("alice-tab")).toBeUndefined();
  });

  it("undoes another user's change to a key, and lets the owner's new connection change it", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    alice.store.set("alice-own", { findingId: null });
    await vi.waitFor(() => expect(bob.store.get("alice-own")).toEqual({ findingId: null }));
    bob.store.set("alice-own", { findingId: "spoofed" });
    bob.store.delete("alice-own");
    bob.store.set("bob-own", { findingId: null });
    await vi.waitFor(() => expect(alice.store.get("bob-own")).toBeDefined());
    expect(alice.store.get("alice-own")).toEqual({ findingId: null });
    const carol = await join("carol");
    await vi.waitFor(() => expect(carol.store.get("alice-own")).toEqual({ findingId: null }));

    const reconnected = await join("alice");
    reconnected.store.set("alice-own", { findingId: "moved" });
    await vi.waitFor(() => expect(bob.store.get("alice-own")).toEqual({ findingId: "moved" }));
  });
});
