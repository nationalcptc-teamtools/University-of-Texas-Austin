import {
  findingContentOf,
  findingEntrySchema,
  writeFinding,
  type FindingContent,
  type FindingEntry,
} from "@burokrat/domain";
import type { LoroMap } from "loro-crdt";
import { nanoid } from "nanoid";
import type { ProjectSession } from "../project-session.ts";

type Targets = FindingEntry["targets"];

/** Adds a finding owned by `owner`, affecting `targets`, offline too, and returns its id. */
export function addFinding(
  session: ProjectSession,
  content: FindingContent,
  owner: string,
  targets: Targets = {},
) {
  const id = nanoid();
  const entry = {
    ...content,
    targets,
    owner,
    createdBy: owner,
    createdAt: Date.now(),
    deleted: false,
  };
  writeFinding(session.doc.getMap("findings"), id, entry);
  session.doc.commit({ origin: "sys:create" });
  return id;
}

/** Adds a copy of a finding's current content, owned by `owner`, and returns its id. */
export function duplicateFinding(session: ProjectSession, findingId: string, owner: string) {
  const original = session.doc.getMap("findings").get(findingId) as LoroMap;
  const entry = findingEntrySchema.parse(original.toJSON());
  const content = findingContentOf(entry, {});
  const title = `${content.title} (copy)`.slice(0, 500);
  return addFinding(session, { ...content, title }, owner, entry.targets);
}

/** Changes who owns the finding. The change is the project's, so it is not undone with Mod-Z. */
export function claimFinding(session: ProjectSession, findingId: string, owner: string) {
  session.store.setState((draft) => void (draft.findings[findingId]!.owner = owner), {
    origin: "sys:claim",
  });
}

/** Deletes or restores a finding. A deleted one is kept in the doc, so it can be restored. */
export function setDeleted(session: ProjectSession, findingId: string, deleted: boolean) {
  session.store.setState((draft) => void (draft.findings[findingId]!.deleted = deleted), {
    origin: "sys:delete",
  });
}
