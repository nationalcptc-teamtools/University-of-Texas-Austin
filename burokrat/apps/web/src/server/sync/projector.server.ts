import { eq } from "drizzle-orm";
import type { LoroDoc } from "loro-crdt";
import { getDb } from "../db.server.ts";
import { projects } from "../schema.ts";

/** Copies the project doc's name to the project list. */
export function projectName(projectId: string, doc: LoroDoc) {
  const name = doc.getMap("project").get("name");
  if (typeof name !== "string") return;
  getDb().update(projects).set({ name }).where(eq(projects.id, projectId)).run();
}
