import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { expect, it } from "vite-plus/test";
import { toggleWrap } from "./format.ts";

function run(doc: string, from: number, to: number) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  toggleWrap("*", "*")({ state, dispatch: (tr: Transaction) => void (state = tr.state) });
  const { from: start, to: end } = state.selection.main;
  return { doc: state.doc.toString(), selected: state.sliceDoc(start, end) };
}

it("wraps the selection and keeps it selected", () => {
  expect(run("make this bold", 5, 9)).toEqual({ doc: "make *this* bold", selected: "this" });
});

it("unwraps a selection that is already wrapped", () => {
  expect(run("make *this* bold", 6, 10)).toEqual({ doc: "make this bold", selected: "this" });
});

it("leaves the cursor between the markers when nothing is selected", () => {
  expect(run("ab", 1, 1)).toEqual({ doc: "a**b", selected: "" });
});
