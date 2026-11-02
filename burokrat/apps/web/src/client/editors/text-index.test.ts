import { LoroDoc, type TextDiff } from "loro-crdt";
import { describe, expect, it } from "vite-plus/test";
import { mapIndex, moveIndex } from "./text-index.ts";

/** The diff a remote peer's edit produces, as the local doc sees it. */
function remoteDiff(initial: string, edit: (text: ReturnType<LoroDoc["getText"]>) => void) {
  const local = new LoroDoc();
  local.getText("t").insert(0, initial);
  local.commit();
  const remote = LoroDoc.fromSnapshot(local.export({ mode: "snapshot" }));
  edit(remote.getText("t"));
  remote.commit();
  let diff: TextDiff | undefined;
  local.subscribe(({ events }) => (diff = events[0]!.diff as TextDiff));
  local.import(remote.export({ mode: "update", from: local.version() }));
  return diff!;
}

describe("mapIndex", () => {
  it("moves a caret right past text inserted before it", () => {
    const diff = remoteDiff("hello world", (text) => text.insert(0, "oh, "));
    expect(mapIndex(diff, 5)).toBe(9);
  });

  it("leaves a caret before text inserted after it", () => {
    const diff = remoteDiff("hello world", (text) => text.insert(11, "!"));
    expect(mapIndex(diff, 5)).toBe(5);
  });

  it("pulls a caret left by text deleted before it, up to where the deletion starts", () => {
    expect(
      mapIndex(
        remoteDiff("hello world", (text) => text.delete(0, 6)),
        8,
      ),
    ).toBe(2);
    expect(
      mapIndex(
        remoteDiff("hello world", (text) => text.delete(2, 6)),
        5,
      ),
    ).toBe(2);
  });

  it("counts UTF-16 units, like an input's selection", () => {
    const diff = remoteDiff("ab", (text) => text.insert(0, "😀"));
    expect(mapIndex(diff, 1)).toBe(3);
  });
});

describe("moveIndex", () => {
  it("moves a caret right past text inserted before it", () => {
    expect(moveIndex("hello world", "oh, hello world", 9)).toBe(13);
  });

  it("leaves a caret before a change after it", () => {
    expect(moveIndex("hello world", "hello there", 3)).toBe(3);
  });

  it("puts a caret inside replaced text at the end of the new text", () => {
    expect(moveIndex("hello world", "hello there", 8)).toBe(11);
  });

  it("pulls a caret left by text deleted before it", () => {
    expect(moveIndex("hello world", "world", 8)).toBe(2);
  });
});
