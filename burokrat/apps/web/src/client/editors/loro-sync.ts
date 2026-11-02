// Fork of loro-codemirror 0.3.3 src/sync.ts. Changes are marked FIX.
import { Annotation, type ChangeSpec } from "@codemirror/state";
import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { LoroDoc, LoroEventBatch, LoroText, Subscription, TextDiff } from "loro-crdt";

export const loroSyncAnnotation = Annotation.define<unknown>();

export function textChanges(diff: TextDiff): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  let pos = 0;
  for (const delta of diff.diff) {
    if (delta.insert) changes.push({ from: pos, to: pos, insert: delta.insert });
    else if (delta.delete) {
      changes.push({ from: pos, to: pos + delta.delete });
      pos += delta.delete;
    } else if (delta.retain != null) pos += delta.retain;
  }
  return changes;
}

class LoroSyncPluginValue implements PluginValue {
  private sub?: Subscription;
  private isInitDispatch = false;

  constructor(
    private view: EditorView,
    private doc: LoroDoc,
    private getText: () => LoroText,
    // FIX: every commit carries an origin, so each field's UndoManager can exclude the others.
    private origin: string,
  ) {
    this.sub = doc.subscribe(this.onDocEvent);
    void Promise.resolve().then(() => {
      const text = this.getText().toString();
      if (this.view.state.doc.toString() === text) return;
      // FIX: only arm the skip flag when dispatching; upstream swallows the first edit otherwise.
      this.isInitDispatch = true;
      this.replaceAll(text);
    });
  }

  private replaceAll(text: string) {
    this.view.dispatch({
      changes: [{ from: 0, to: this.view.state.doc.length, insert: text }],
      annotations: [loroSyncAnnotation.of(this)],
    });
  }

  private onDocEvent = (batch: LoroEventBatch) => {
    // FIX: reflect local programmatic edits too, except this editor's own and undo's.
    if (batch.by === "local" && (batch.origin === this.origin || batch.origin === "undo")) return;
    if (batch.by === "checkout") return this.replaceAll(this.getText().toString());
    const id = this.getText().id;
    for (const { diff, target } of batch.events) {
      // FIX: `continue`, not `return`: an import touching several fields must reach every editor.
      if (diff.type !== "text" || target !== id) continue;
      this.view.dispatch({
        changes: textChanges(diff),
        annotations: [loroSyncAnnotation.of(this)],
      });
    }
  };

  update(update: ViewUpdate) {
    if (this.isInitDispatch) {
      this.isInitDispatch = false;
      return;
    }
    if (!update.docChanged) return;
    if (update.transactions.some((tr) => tr.annotation(loroSyncAnnotation) !== undefined)) return;
    const text = this.getText();
    let shift = 0;
    update.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
      const inserted = insert.sliceString(0, insert.length, "\n");
      if (fromA !== toA) text.delete(fromA + shift, toA - fromA);
      if (inserted) text.insert(fromA + shift, inserted);
      shift += inserted.length - (toA - fromA);
    });
    this.doc.commit({ origin: this.origin });
  }

  destroy() {
    this.sub?.();
  }
}

export const loroSync = (doc: LoroDoc, getText: () => LoroText, origin: string) =>
  ViewPlugin.define((view) => new LoroSyncPluginValue(view, doc, getText, origin));
