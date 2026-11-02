import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

/** The project list's copy of each project doc's name. The doc holds everything else. */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

/** Each project's doc, keyed by the project's id. */
export const docs = sqliteTable("docs", {
  id: text("id")
    .primaryKey()
    .references(() => projects.id),
  snapshot: blob("snapshot", { mode: "buffer" }).notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const docUpdates = sqliteTable(
  "doc_updates",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    docId: text("doc_id")
      .notNull()
      .references(() => docs.id),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    author: text("author").notNull(),
    at: timestamp("at").notNull(),
  },
  (t) => [index("doc_updates_doc").on(t.docId, t.seq)],
);
