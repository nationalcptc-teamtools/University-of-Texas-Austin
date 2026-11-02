import { expect, it } from "vite-plus/test";
import { jumpAt, jumpBefore, markWords, wordStarts, type Jump } from "./jumps.ts";

const words = (source: string) => wordStarts(source).map((at) => source.slice(at).split(/\s/)[0]);

it("marks the words of plain text, lists and content blocks", () => {
  expect(words("Some *bold words* here\n- one\n  two\n#emph[in block]")).toEqual([
    "Some",
    "words*",
    "here",
    "one",
    "two",
    "block]",
  ]);
});

it("leaves raw text, math, code, references and headings alone", () => {
  expect(words('`raw text` $x + y$ #image("a b") @ref\n= Head line\n```\nblock code\n```')).toEqual(
    [],
  );
});

it("puts a marker holding the field and offset before each word", () => {
  expect(markWords("Alpha bravo", "description")).toBe(
    '#metadata(("description", 0))<jump>Alpha #metadata(("description", 6))<jump>bravo',
  );
});

const at = (offset: number, x: number, y: number): Jump => ({
  field: "description",
  offset,
  page: 1,
  x,
  y,
});
// Two lines: the paragraph's first marker sits at the line's top, the rest on the baseline.
const jumps = [at(0, 0.1, 0.35), at(6, 0.3, 0.36), at(12, 0.6, 0.36), at(20, 0.1, 0.38)];

it("finds the word a click lands on, or the one before it on that line", () => {
  expect(jumpAt(jumps, 1, 0.65, 0.355)?.offset).toBe(12);
  expect(jumpAt(jumps, 1, 0.5, 0.362)?.offset).toBe(6);
  expect(jumpAt(jumps, 1, 0.12, 0.36)?.offset).toBe(0);
  expect(jumpAt(jumps, 1, 0.9, 0.378)?.offset).toBe(20);
});

it("finds nothing above the text, far below it, or on another page", () => {
  expect(jumpAt(jumps, 1, 0.5, 0.3)).toBeUndefined();
  expect(jumpAt(jumps, 1, 0.5, 0.5)).toBeUndefined();
  expect(jumpAt(jumps, 2, 0.5, 0.36)).toBeUndefined();
});

it("finds the word the caret is in or just after, in that field only", () => {
  const other = { ...at(3, 0.5, 0.2), field: "remediation" };
  expect(jumpBefore([...jumps, other], "description", 14)?.offset).toBe(12);
  expect(jumpBefore(jumps, "description", 20)?.offset).toBe(20);
  expect(jumpBefore(jumps, "remediation", 14)).toBeUndefined();
});
