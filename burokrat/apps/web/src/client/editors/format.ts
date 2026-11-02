import { EditorSelection, type StateCommand } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/** Wraps each selection in `before` and `after`, or unwraps it when it already is. */
export function toggleWrap(before: string, after: string): StateCommand {
  return ({ state, dispatch }) => {
    const transaction = state.changeByRange(({ from, to }) => {
      const wrapped =
        state.sliceDoc(from - before.length, from) === before &&
        state.sliceDoc(to, to + after.length) === after;
      if (wrapped) {
        return {
          changes: [
            { from: from - before.length, to: from },
            { from: to, to: to + after.length },
          ],
          range: EditorSelection.range(from - before.length, to - before.length),
        };
      }
      return {
        changes: [
          { from, insert: before },
          { from: to, insert: after },
        ],
        range: EditorSelection.range(from + before.length, to + before.length),
      };
    });
    dispatch(state.update(transaction, { userEvent: "input.format", scrollIntoView: true }));
    return true;
  };
}

/** Ahead of the default keymap, whose Mod-i and Mod-u change the selection instead. */
export const formatKeymap = keymap.of([
  { key: "Mod-b", run: toggleWrap("*", "*") },
  { key: "Mod-i", run: toggleWrap("_", "_") },
  { key: "Mod-u", run: toggleWrap("#underline[", "]") },
  { key: "Mod-Shift-x", run: toggleWrap("#strike[", "]") },
  { key: "Mod-e", run: toggleWrap("`", "`") },
]);
