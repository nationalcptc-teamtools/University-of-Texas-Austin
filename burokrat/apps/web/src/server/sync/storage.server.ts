import { and, asc, eq, lte } from "drizzle-orm";
import { LoroDoc } from "loro-crdt";
import { getDb } from "../db.server.ts";
import { docs, docUpdates } from "../schema.ts";

export type StoredDoc = { doc: LoroDoc; journalLength: number; lastSeq: number };

/** The doc's snapshot with its journal replayed on top, or `undefined` if there is no such doc. */
export function loadDoc(docId: string): StoredDoc | undefined {
  const db = getDb();
  const row = db.select({ snapshot: docs.snapshot }).from(docs).where(eq(docs.id, docId)).get();
  if (!row) return undefined;
  const doc = LoroDoc.fromSnapshot(row.snapshot);
  const journal = db
    .select({ seq: docUpdates.seq, bytes: docUpdates.bytes })
    .from(docUpdates)
    .where(eq(docUpdates.docId, docId))
    .orderBy(asc(docUpdates.seq))
    .all();
  if (journal.length > 0) doc.importBatch(journal.map((entry) => entry.bytes));
  return { doc, journalLength: journal.length, lastSeq: journal.at(-1)?.seq ?? 0 };
}

export function appendUpdate(docId: string, bytes: Uint8Array, author: string): number {
  return getDb()
    .insert(docUpdates)
    .values({ docId, bytes: Buffer.from(bytes), author, at: new Date() })
    .returning({ seq: docUpdates.seq })
    .get().seq;
}

/** Replaces the snapshot and drops the journal entries it now contains, in one transaction. */
export function compactDoc(docId: string, snapshot: Uint8Array, throughSeq: number) {
  getDb().transaction((tx) => {
    tx.update(docs)
      .set({ snapshot: Buffer.from(snapshot), updatedAt: new Date() })
      .where(eq(docs.id, docId))
      .run();
    tx.delete(docUpdates)
      .where(and(eq(docUpdates.docId, docId), lte(docUpdates.seq, throughSeq)))
      .run();
  });
}
