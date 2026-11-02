import { nanoid } from "nanoid";
import {
  createProjectDoc,
  projectContent,
  type ProjectContent,
  type ProjectInfo,
} from "@burokrat/domain";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db.server.ts";
import { docs, projects } from "./schema.ts";
import { loadDoc } from "./sync/storage.server.ts";

export type ProjectRow = typeof projects.$inferSelect;

/** A file name like `Acme-report.pdf`, safe in a `Content-Disposition` header. */
export function downloadName(project: ProjectInfo, suffix: string) {
  const base = `${project.companyName || project.name} ${suffix}`;
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function listProjects(): ProjectRow[] {
  return getDb().select().from(projects).orderBy(desc(projects.createdAt)).all();
}

export function createProject(content: ProjectContent, id: string = nanoid()): ProjectRow {
  const now = new Date();
  const snapshot = Buffer.from(createProjectDoc(content).export({ mode: "snapshot" }));
  return getDb().transaction((tx) => {
    const project = tx
      .insert(projects)
      .values({ id, name: content.project.name, createdAt: now })
      .returning()
      .get();
    tx.insert(docs).values({ id, snapshot, updatedAt: now }).run();
    return project;
  });
}

export function liveProject(projectId: string): ProjectRow | undefined {
  return getDb().select().from(projects).where(eq(projects.id, projectId)).get();
}

/** The project doc's content. Every accepted update is journaled before it is acknowledged. */
export function readProject(projectId: string): ProjectContent | undefined {
  const stored = loadDoc(projectId);
  if (!stored) return undefined;
  try {
    return projectContent(stored.doc.toJSON());
  } finally {
    stored.doc.free();
  }
}
