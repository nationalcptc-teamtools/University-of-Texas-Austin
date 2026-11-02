import { UndoManager, type LoroDoc } from "loro-crdt";
import type { KeyboardEvent } from "react";

/** Commit origin of an undo unit. The `|` keeps one unit's origin from prefixing another's. */
export const originOf = (unit: string) => `${unit}|`;

export const STRUCT = "struct";

/**
 * One UndoManager per undoable unit (a text field, the title, or a page's form fields), so Mod-Z
 * only undoes edits in the focused field. Each manager excludes every other unit's origin;
 * a commit without an origin would land in every stack.
 */
export class UndoRegistry {
  private managers = new Map<string, UndoManager>();

  constructor(private doc: LoroDoc) {}

  get(unit: string) {
    let manager = this.managers.get(unit);
    if (manager) return manager;
    manager = new UndoManager(this.doc, {
      mergeInterval: 500,
      excludeOriginPrefixes: ["sys:", "undo", ...[...this.managers.keys()].map(originOf)],
    });
    for (const other of this.managers.values()) other.addExcludeOriginPrefix(originOf(unit));
    this.managers.set(unit, manager);
    return manager;
  }

  free() {
    for (const manager of this.managers.values()) manager.free();
    this.managers.clear();
  }
}

/** Mod-Z undoes on `manager`, and Mod-Shift-Z or Mod-Y redoes. */
export function undoKey(event: KeyboardEvent, manager: UndoManager) {
  if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return;
  event.preventDefault();
  if (key === "y" || event.shiftKey) manager.redo();
  else manager.undo();
}

/** Mod-Z outside the text fields undoes the form edits of `unit`. Text fields handle their own. */
export const undoFormEdits = (undo: UndoRegistry, unit: string) => (event: KeyboardEvent) =>
  undoKey(event, undo.get(unit));
