// Fork of loro-codemirror 0.3.3 src/undo.ts. Changes are marked FIX.
import { EditorSelection, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import type { Cursor, LoroDoc, LoroText, Subscription, UndoManager } from "loro-crdt";
import { loroSyncAnnotation, textChanges } from "./loro-sync.ts";

class UndoPluginValue implements PluginValue {
  private sub: Subscription;
  private lastSelection: { anchor?: Cursor; head?: Cursor } = {};

  constructor(
    private view: EditorView,
    doc: LoroDoc,
    undoManager: UndoManager,
    private getText: () => LoroText,
  ) {
    this.sub = doc.subscribe((batch) => {
      if (batch.origin !== "undo") return;
      const id = this.getText().id;
      for (const { diff, target } of batch.events) {
        // FIX: `continue`, not `return`.
        if (diff.type !== "text" || target !== id) continue;
        this.view.dispatch({
          changes: textChanges(diff),
          annotations: [loroSyncAnnotation.of("undo")],
        });
      }
    });

    undoManager.setOnPop((_isUndo, value) => {
      const [anchor, head] = value.cursors;
      if (!anchor) return;
      setTimeout(() => {
        const anchorPos = doc.getCursorPos(anchor)?.offset ?? 0;
        const headPos = head ? (doc.getCursorPos(head)?.offset ?? anchorPos) : anchorPos;
        const selection = EditorSelection.single(anchorPos, headPos);
        this.view.dispatch({
          selection,
          effects: [EditorView.scrollIntoView(selection.ranges[0]!)],
        });
      });
    });

    undoManager.setOnPush((isUndo) => {
      if (!isUndo) this.lastSelection = this.cursors(this.view.state.selection.main);
      const { anchor, head } = this.lastSelection;
      return { value: null, cursors: [anchor, head].filter((cursor) => cursor !== undefined) };
    });
  }

  private cursors({ anchor, head }: { anchor: number; head: number }) {
    const text = this.getText();
    return { anchor: text.getCursor(anchor), head: text.getCursor(head) };
  }

  update(update: ViewUpdate) {
    if (update.selectionSet) this.lastSelection = this.cursors(update.state.selection.main);
  }

  destroy() {
    this.sub();
  }
}

/**
 * Per-field undo. FIX: the commands call the UndoManager directly. Upstream runs it inside a
 * StateField update, and loro-crdt 1.17 delivers the resulting events synchronously, which
 * dispatches into the view mid-transaction and corrupts it.
 */
export function loroUndo(doc: LoroDoc, undoManager: UndoManager, getText: () => LoroText) {
  const undo = () => (undoManager.undo(), true);
  const redo = () => (undoManager.redo(), true);
  return [
    ViewPlugin.define((view) => new UndoPluginValue(view, doc, undoManager, getText)),
    Prec.high(
      keymap.of([
        { key: "Mod-z", run: undo, preventDefault: true },
        { key: "Mod-y", mac: "Mod-Shift-z", run: redo, preventDefault: true },
        { key: "Mod-Shift-z", run: redo, preventDefault: true },
      ]),
    ),
  ];
}
