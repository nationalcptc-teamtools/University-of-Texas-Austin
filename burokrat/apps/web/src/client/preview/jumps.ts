import { FINDING_PROSE } from "@burokrat/domain";
import type { TypstInput } from "@burokrat/typst/browser";
import type { SyntaxNode } from "@lezer/common";
import { TypstLezerParser } from "codemirror-lang-typst/lezer";

type TypstData = TypstInput["data"];
type FieldData = TypstData["findings"][number]["description"];

/** Where a word of an editor field landed: its page, and fractions of that page's size. */
export type Jump = { field: string; offset: number; page: number; x: number; y: number };

const parser = new TypstLezerParser();

/**
 * Markup that shows its text as written; a `ContentBlock` starts markup again inside code.
 * Headings are left out: a label at the start of one goes to the heading, not the marker.
 */
const MARKUP = new Set(["Typst", "Markup", "Strong", "Emph", "ListItem", "EnumItem", "TermItem"]);

function inMarkup(node: SyntaxNode) {
  for (let parent = node.parent; parent && parent.name !== "ContentBlock"; parent = parent.parent) {
    if (!MARKUP.has(parent.name)) return false;
  }
  return true;
}

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Where each word of plain text starts; raw text, math, code and markers are left alone. */
export function wordStarts(source: string) {
  const starts: number[] = [];
  parser.parse(source).iterate({
    enter: ({ name, from, to, node }) => {
      if (name !== "Text" || !inMarkup(node)) return;
      for (let at = from; at < to; at++) {
        if (!isSpace(source[at]) && isSpace(source[at - 1])) starts.push(at);
      }
    },
  });
  return starts;
}

/** How far a line reaches above and below a word's marker, as fractions of an A4 page's height. */
const LINE_ABOVE = 0.014;
const LINE_BELOW = 0.006;
/** How far below its last marker a click still counts as being on that text. */
const TEXT_BELOW = 0.02;

/**
 * The word a click on `page` lands on: the last one starting before it in reading order, on the
 * click's line or the line above. A paragraph's first marker sits at the top of its line, the
 * others on the baseline; the line's reach covers both.
 */
export function jumpAt(jumps: Jump[], page: number, x: number, y: number) {
  let found: Jump | undefined;
  for (const jump of jumps) {
    if (jump.page !== page || y < jump.y - LINE_ABOVE) continue;
    if (y > jump.y + LINE_BELOW || jump.x <= x) found = jump;
  }
  return found && y <= found.y + TEXT_BELOW ? found : undefined;
}

/** Puts an invisible `<jump>` marker before each word, holding the field and the word's offset. */
export function markWords(source: string, field: string) {
  let marked = "";
  let last = 0;
  for (const at of wordStarts(source)) {
    marked += `${source.slice(last, at)}#metadata((${JSON.stringify(field)}, ${at}))<jump>`;
    last = at;
  }
  return marked + source.slice(last);
}

/**
 * The data with every field the page edits marked word by word, under the name of the
 * `data-anchor` around its editor: a finding's prose, or a report's text before and after the findings.
 */
export function markJumps(data: TypstData): TypstData {
  const mark = (name: string, field: FieldData) => ({
    ...field,
    source: markWords(field.source, name),
  });
  return {
    ...data,
    findings: data.findings.map((finding) =>
      finding.standalone
        ? {
            ...finding,
            ...Object.fromEntries(FINDING_PROSE.map(({ key }) => [key, mark(key, finding[key])])),
          }
        : finding,
    ),
    report: data.report && {
      ...data.report,
      prologue: mark("prologue", data.report.prologue),
      epilogue: mark("epilogue", data.report.epilogue),
    },
  };
}

/** The last word of `field` starting at or before `offset`, where the caret is. */
export function jumpBefore(jumps: Jump[], field: string, offset: number) {
  let found: Jump | undefined;
  for (const jump of jumps) {
    if (jump.field === field && jump.offset <= offset && jump.offset >= (found?.offset ?? 0)) {
      found = jump;
    }
  }
  return found;
}
