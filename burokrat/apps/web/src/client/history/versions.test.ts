import { LoroDoc } from "loro-crdt";
import { expect, it } from "vite-plus/test";
import { recordAuthor, restoreScope, versionsOf } from "./versions.ts";

const T = [["t"]];

/** Appends `text` to `name` as `author` at `seconds`, as that person's client would commit it. */
function edit(doc: LoroDoc, author: string, seconds: number, text: string, name = "t") {
  const stop = recordAuthor(doc, author);
  const stamp = doc.subscribePreCommit(({ modifier }) => modifier.setTimestamp(seconds));
  const field = doc.getText(name);
  field.insert(field.length, text);
  doc.commit();
  stamp();
  stop();
}

/** A copy of `doc` with its own peer, as another person's device would hold it. */
function copyOf(doc: LoroDoc) {
  return LoroDoc.fromSnapshot(doc.export({ mode: "snapshot" }));
}

it("groups one author's nearby edits and splits on another author or a long pause", () => {
  const alice = new LoroDoc();
  edit(alice, "Alice", 1_000, "a");
  edit(alice, "Alice", 1_100, "b");
  const bob = copyOf(alice);
  edit(bob, "Bob", 1_200, "c");
  alice.import(bob.export({ mode: "update" }));
  edit(alice, "Alice", 2_000, "d");

  const versions = versionsOf(alice, T);
  expect(versions.map(({ author, time }) => [author, time])).toEqual([
    ["Alice", 1_100_000],
    ["Bob", 1_200_000],
    ["Alice", 2_000_000],
  ]);
  expect(versions.map(({ frontiers }) => alice.forkAt(frontiers).getText("t").toString())).toEqual([
    "ab",
    "abc",
    "abcd",
  ]);
});

it("puts edits made before authors were recorded in one version", () => {
  const doc = new LoroDoc();
  doc.getText("t").insert(0, "old");
  doc.commit();
  const other = copyOf(doc);
  other.getText("t").insert(3, "er");
  other.commit();
  doc.import(other.export({ mode: "update" }));
  edit(doc, "Alice", 1_000, "!");

  expect(versionsOf(doc, T).map(({ author, time }) => [author, time])).toEqual([
    ["", 0],
    ["Alice", 1_000_000],
  ]);
});

it("lists and restores only the scope's part of the doc", () => {
  const doc = new LoroDoc();
  edit(doc, "Alice", 1_000, "a");
  edit(doc, "Bob", 1_100, "x", "u");
  edit(doc, "Alice", 2_000, "b");
  edit(doc, "Bob", 2_100, "y", "u");

  const versions = versionsOf(doc, T);
  expect(versions.map(({ author }) => author)).toEqual(["Alice", "Alice"]);
  restoreScope(doc, versions[0]!.frontiers, T);
  expect(doc.toJSON()).toEqual({ t: "a", u: "xy" });
});
