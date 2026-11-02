import {
  VersionVector,
  type Change,
  type ContainerID,
  type Frontiers,
  type LoroDoc,
  type PeerID,
} from "loro-crdt";

/** One person's edits this close together make one version. */
const SAME_VERSION_MS = 5 * 60_000;
/** Local edits this many seconds apart are kept as separate changes. */
const CHANGE_MERGE_SECONDS = 60;

/**
 * A point in a doc's history: who made the edits leading to it, when the last of them was made
 * (0 when unknown), and the doc's frontiers there.
 */
export type Version = { author: string; time: number; frontiers: Frontiers };

/** The paths of a page's part of the doc, such as `["findings", id]`; containers under them belong to it. */
export type Scope = string[][];

const within = (path: (string | number)[] | undefined, scope: Scope) =>
  path !== undefined && scope.some((prefix) => prefix.every((key, index) => path[index] === key));

const touches = (doc: LoroDoc, { peer, counter, length }: Change, scope: Scope) =>
  doc
    .getChangedContainersIn({ peer, counter }, length)
    .some((id) => within(doc.getPathToContainer(id), scope));

/** Stamps each change this doc commits with the time and `author`, for its history. */
export function recordAuthor(doc: LoroDoc, author: string) {
  doc.setRecordTimestamp(true);
  doc.setChangeMergeInterval(CHANGE_MERGE_SECONDS);
  return doc.subscribePreCommit(({ modifier }) => modifier.setMessage(author));
}

/**
 * The history of the scope's part of the doc, oldest first. Changes are taken in causal order, and
 * one author's changes to the scope close together make one version. Changes made before authors
 * were recorded make one version.
 */
export function versionsOf(doc: LoroDoc, scope: Scope): Version[] {
  const changes = [...doc.getAllChanges().values()]
    .flat()
    .sort((a, b) => a.lamport - b.lamport || a.peer.localeCompare(b.peer));
  const seen = new Map<PeerID, number>();
  const groups: { author: string; time: number; seen: Map<PeerID, number> }[] = [];
  for (const change of changes) {
    seen.set(change.peer, change.counter + change.length);
    if (!touches(doc, change, scope)) continue;
    const author = change.message ?? "";
    const time = change.timestamp * 1000;
    const last = groups.at(-1);
    if (last && last.author === author && time - last.time <= SAME_VERSION_MS) {
      last.time = Math.max(last.time, time);
      last.seen = new Map(seen);
    } else {
      groups.push({ author, time, seen: new Map(seen) });
    }
  }
  return groups.map(({ author, time, seen }) => ({
    author,
    time,
    frontiers: doc.vvToFrontiers(VersionVector.parseJSON(seen)),
  }));
}

/**
 * Puts the scope's part of the doc back as it was at `frontiers`, keeping everything else as it
 * is. A container the scope gained since is read where it was then.
 */
export function restoreScope(doc: LoroDoc, frontiers: Frontiers, scope: Scope) {
  const past = doc.forkAt(frontiers);
  try {
    const inScope = ([id]: [ContainerID, unknown]) =>
      within(doc.getPathToContainer(id) ?? past.getPathToContainer(id), scope);
    doc.applyDiff(doc.diff(doc.frontiers(), frontiers, false).filter(inScope), { fullState: true });
  } finally {
    past.free();
  }
}
