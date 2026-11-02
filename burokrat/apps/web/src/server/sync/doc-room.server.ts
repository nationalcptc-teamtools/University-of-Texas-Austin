import {
  ASSET_ID,
  assetEntrySchema,
  FINDING_ID,
  findingEntrySchema,
  MAX_ASSETS,
  MAX_FINDINGS,
  projectDocSchema,
  reportContentSchema,
} from "@burokrat/domain";
import { isContainer, VersionVector, type LoroDoc, type LoroEvent } from "loro-crdt";
import { UpdateStatusCode, type HexString } from "loro-protocol";
import type { z } from "zod";
import { ack, rejoinSuggested, type Joined, type Peer, type Room } from "./peer.server.ts";
import { appendUpdate, compactDoc, loadDoc, type StoredDoc } from "./storage.server.ts";

const COMPACT_EVERY_UPDATES = 500;
const COMPACT_AFTER_MS = 5 * 60_000;
const SETTLE_DEBOUNCE_MS = 500;
const SETTLE_MAX_WAIT_MS = 2_000;

const REPORT_FIELDS: Record<string, z.ZodType | undefined> = reportContentSchema.shape;
const RECORDS = {
  findings: { key: FINDING_ID, entry: findingEntrySchema, max: MAX_FINDINGS },
  assets: { key: ASSET_ID, entry: assetEntrySchema, max: MAX_ASSETS },
} as const;

const isRecord = (root: unknown): root is keyof typeof RECORDS =>
  root === "findings" || root === "assets";

const json = (value: unknown) => (isContainer(value) ? value.toJSON() : value);

/**
 * The parts of the doc an event touches, checked one by one: `project`, `report/<field>`,
 * `findings/<id>`, `assets/<sha>`, or a record itself for its size. "" is a change to the doc's
 * shape, which only a full parse can check.
 */
function unitsOf({ path, diff }: LoroEvent): string[] {
  const [root, key] = path;
  if (root === "project") return ["project"];
  if (root === "report" && path.length > 1) return [`report/${key}`];
  if (!isRecord(root)) return [""];
  if (path.length > 1) return [`${root}/${key}`];
  if (diff.type !== "map") return [""];
  return [root, ...Object.keys(diff.updated).map((id) => `${root}/${id}`)];
}

/** Told when accepted edits settle, with the doc and who wrote last. */
export type OnSettled = (doc: LoroDoc, author: string) => void;

/** One `%LOR` room: the server's copy of a doc, its journal and its members. */
export class DocRoom implements Room {
  readonly crdt = "%LOR";
  readonly members = new Set<Peer>();
  private compactTimer?: NodeJS.Timeout;
  private settleTimer?: NodeJS.Timeout;
  private settleDue?: number;
  private lastAuthor = "";

  constructor(
    readonly roomId: string,
    private readonly docId: string,
    private stored: StoredDoc,
    private onSettled?: OnSettled,
  ) {}

  private get doc() {
    return this.stored.doc;
  }

  join(peer: Peer, clientVersion: Uint8Array): Joined {
    const from =
      clientVersion.length > 0 ? VersionVector.decode(clientVersion) : new VersionVector(null);
    this.members.add(peer);
    return {
      version: this.doc.version().encode(),
      missing: this.doc.export({ mode: "update", from }),
    };
  }

  leave(peer: Peer) {
    this.members.delete(peer);
  }

  /**
   * A rejected update is never stored or sent, and its sender is evicted. One that depends on
   * changes the server lacks is kept, and the sender asked to rejoin and resend them.
   */
  apply(peer: Peer, batchId: HexString, updates: Uint8Array[]) {
    const result = this.import(peer, updates);
    const status = result === "invalid" ? UpdateStatusCode.InvalidUpdate : UpdateStatusCode.Ok;
    peer.send(ack(this.crdt, this.roomId, batchId, status));
    if (result === "pending") peer.send(rejoinSuggested(this.crdt, this.roomId));
    if (result === "invalid")
      peer.evict(this.crdt, this.roomId, "The update was rejected as invalid");
  }

  private import(peer: Peer, updates: Uint8Array[]) {
    const before = this.doc.oplogVersion();
    const changed = new Set<string>();
    const unsubscribe = this.doc.subscribe(({ events }) => {
      for (const event of events) for (const unit of unitsOf(event)) changed.add(unit);
    });
    let pending: boolean;
    try {
      pending = this.doc.importBatch(updates).pending !== null;
      unsubscribe();
      this.validate(changed);
    } catch {
      unsubscribe();
      this.reload();
      return "invalid";
    }
    if (this.doc.oplogVersion().compare(before) !== 0) this.accept(peer, before);
    return pending ? "pending" : "ok";
  }

  /**
   * Checks the parts an import changed against their schemas. Re-reading the whole doc costs
   * milliseconds once it holds long prose, so that only happens when its shape may have changed.
   * Records only grow: a deleted finding is flagged, never removed.
   */
  private validate(changed: Set<string>) {
    if (changed.has("")) return void projectDocSchema.parse(this.doc.toJSON());
    for (const unit of changed) this.check(unit);
  }

  private check(unit: string) {
    const [root, key] = unit.split("/");
    if (root === "project") {
      projectDocSchema.shape.project.parse(this.doc.getMap("project").toJSON());
    } else if (root === "report") {
      const schema = REPORT_FIELDS[key!];
      if (!schema) return void projectDocSchema.parse(this.doc.toJSON());
      schema.parse(json(this.doc.getMap("report").get(key!)));
    } else if (isRecord(root)) {
      const { key: pattern, entry, max } = RECORDS[root];
      const record = this.doc.getMap(root);
      if (key === undefined) {
        if (record.size > max) throw new Error(`Too many ${root}`);
      } else {
        if (!pattern.test(key)) throw new Error(`Invalid key ${unit}`);
        entry.parse(json(record.get(key)));
      }
    }
  }

  private accept(peer: Peer, before: VersionVector) {
    const delta = this.doc.export({ mode: "update", from: before });
    this.stored.lastSeq = appendUpdate(this.docId, delta, peer.name);
    this.stored.journalLength++;
    for (const member of this.members) {
      if (member !== peer) member.sendUpdate("%LOR", this.roomId, delta);
    }
    this.lastAuthor = peer.name;
    this.scheduleCompaction();
    this.scheduleSettled();
  }

  /** Drops in-memory state that storage doesn't have, such as a rejected update. */
  private reload() {
    const stored = loadDoc(this.docId);
    if (!stored) throw new Error(`Doc ${this.docId} disappeared`);
    this.stored.doc.free();
    this.stored = stored;
  }

  private scheduleCompaction() {
    if (this.stored.journalLength >= COMPACT_EVERY_UPDATES) return this.compact();
    this.compactTimer ??= setTimeout(() => this.compact(), COMPACT_AFTER_MS).unref();
  }

  compact() {
    clearTimeout(this.compactTimer);
    this.compactTimer = undefined;
    if (this.stored.journalLength === 0) return;
    compactDoc(this.docId, this.doc.export({ mode: "snapshot" }), this.stored.lastSeq);
    this.stored.journalLength = 0;
  }

  private scheduleSettled() {
    if (!this.onSettled) return;
    this.settleDue ??= Date.now() + SETTLE_MAX_WAIT_MS;
    const delay = Math.min(SETTLE_DEBOUNCE_MS, this.settleDue - Date.now());
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settle(), Math.max(0, delay)).unref();
  }

  private settle() {
    clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
    this.settleDue = undefined;
    this.onSettled?.(this.doc, this.lastAuthor);
  }

  /** Flushes the settled edits and journal, then frees the doc. */
  close() {
    if (this.settleTimer) this.settle();
    this.compact();
    this.doc.free();
  }
}
