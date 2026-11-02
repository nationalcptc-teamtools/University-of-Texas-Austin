import {
  HighlightStyle,
  Language,
  LanguageSupport,
  languageDataProp,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { getStyleTags, styleTags, Tag, tags } from "@lezer/highlight";
import {
  TypstLezerParser,
  typstLezerLanguageData,
  typstLezerLinter,
  typstLezerListKeymap,
  typstTags,
} from "codemirror-lang-typst/lezer";

const mathOperator = Tag.define();
const term = Tag.define();
const func = tags.function(tags.variableName);

/** Typst's own highlighter (typst-syntax `highlight.rs`), for the kinds that need no context. */
const highlighting = styleTags({
  "Shebang LineComment BlockComment": tags.comment,
  "Linebreak Escape Shorthand MathShorthand": tags.escape,
  "Strong/...": tags.strong,
  "Emph/...": tags.emphasis,
  "Raw/...": tags.monospace,
  "Link/...": tags.link,
  "Label Ref/...": tags.labelName,
  "Heading/...": tags.heading,
  "ListMarker EnumMarker TermMarker": typstTags.listMarker,
  Dollar: typstTags.mathDelimiter,
  "Hat MathPrimes MathAlignPoint Root MathFrac/Slash MathAttach/Underscore": mathOperator,
  "Math/LeftParen Math/RightParen": mathOperator,
  "Not And Or None Auto Let Set Show Context If Else For In While Break Continue Return Import Include As Bool":
    tags.keyword,
  "Plus Minus Star Slash Eq EqEq ExclEq Lt LtEq Gt GtEq PlusEq HyphEq StarEq SlashEq Dots Arrow":
    tags.operator,
  "Strong/Star": tags.strong,
  "Heading/Eq": tags.heading,
  "Int Float Numeric": tags.number,
  Str: tags.string,
});

const color = (light: string, dark: string) => `light-dark(${light}, ${dark})`;

/** Typst's "Typst Light" theme, with lighter variants of each colour for the dark theme. */
const style = HighlightStyle.define([
  { tag: tags.comment, color: color("#74747c", "#8e8e96") },
  { tag: [tags.escape, tags.labelName, mathOperator], color: color("#1d6c76", "#4fb6c2") },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.monospace, color: color("#6b6b6f", "#a5a5ab") },
  { tag: tags.heading, fontWeight: "600", textDecoration: "underline" },
  { tag: term, fontWeight: "600" },
  { tag: [typstTags.listMarker, typstTags.interpolated], color: color("#8b41b1", "#c792ea") },
  { tag: [typstTags.mathDelimiter, tags.string], color: color("#198810", "#62c454") },
  { tag: [tags.keyword, tags.operator], color: color("#d73948", "#ff6b78") },
  { tag: tags.number, color: color("#b60157", "#f26aa2") },
  { tag: func, color: color("#4b69c6", "#86a1ff") },
]);

const ignoringSpace = (node: SyntaxNode | null, step: (node: SyntaxNode) => SyntaxNode | null) => {
  while (node?.name === "Space") node = step(node);
  return node;
};

/** `highlight_ident`: a callee is a function; code embedded in markup or math is interpolated. */
function identTag(tree: Tree, ident: SyntaxNode): Tag | undefined {
  const next = tree.resolveInner(ident.to, 1);
  const parent = next.parent?.name;
  if (
    next.from === ident.to &&
    ((next.name === "LeftParen" &&
      (parent === "Args" || parent === "MathArgs" || parent === "Params")) ||
      (next.name === "LeftBracket" && parent === "ContentBlock"))
  ) {
    return func;
  }
  if (ident.name === "MathIdent") return typstTags.interpolated;
  let access = ident;
  while (access.parent?.name === "FieldAccess") access = access.parent;
  const after = ignoringSpace(access.nextSibling, (node) => node.nextSibling);
  if (access.parent?.name === "ShowRule" && after?.name === "Colon") return func;
  if (tree.resolveInner(access.from, -1).name === "Hash") return typstTags.interpolated;
  const dot = tree.resolveInner(ident.from, -1);
  if (dot.name !== "Dot") return undefined;
  const object = tree.resolveInner(dot.from, -1);
  return object.name === "Ident" ? identTag(tree, object) : undefined;
}

const isIdent = (node: SyntaxNode) => node.name === "Ident" || node.name === "MathIdent";

const listOf = (tag: Tag | undefined): readonly Tag[] => (tag ? [tag] : []);

/** `highlight_hash`: the `#` takes the tag of the first token of the expression it starts. */
function hashTags(tree: Tree, hash: SyntaxNode): readonly Tag[] {
  let leaf = hash.nextSibling;
  if (leaf?.from !== hash.to) return [];
  while (leaf.firstChild) leaf = leaf.firstChild;
  return isIdent(leaf) ? listOf(identTag(tree, leaf)) : (getStyleTags(leaf)?.tags ?? []);
}

function contextTags(tree: Tree, node: SyntaxNode): readonly Tag[] {
  if (isIdent(node)) return listOf(identTag(tree, node));
  if (node.name === "Hash") return hashTags(tree, node);
  if (node.name !== "Markup" || node.parent?.name !== "TermItem") return [];
  const after = ignoringSpace(node.nextSibling, (next) => next.nextSibling);
  return listOf(after?.name === "Colon" ? term : undefined);
}

function contextDecorations(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state);
  const marks: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: ({ node }) => {
        const className = style.style(contextTags(tree, node));
        if (className) marks.push(Decoration.mark({ class: className }).range(node.from, node.to));
      },
    });
  }
  return Decoration.set(marks, true);
}

/** `highlight.rs` rules that look at a node's neighbours, which `styleTags` cannot express. */
const contextHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = contextDecorations(view);
    }

    update(update: ViewUpdate) {
      const reparsed = syntaxTree(update.state) !== syntaxTree(update.startState);
      if (update.docChanged || update.viewportChanged || reparsed) {
        this.decorations = contextDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const parser = new TypstLezerParser(
  languageDataProp.add((type) => (type.isTop ? typstLezerLanguageData : undefined)),
  highlighting,
);

/** Highlighting as typst.app does it, syntax lint and list continuation, without the WASM parser. */
export const typst = new LanguageSupport(
  new Language(typstLezerLanguageData, parser, [], "typst"),
  [syntaxHighlighting(style), contextHighlighting, typstLezerListKeymap, typstLezerLinter],
);
