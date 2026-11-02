// Fork of loro-codemirror 0.3.3 src/ephemeral.ts, reduced to what we use.
import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  layer,
  RectangleMarker,
  ViewPlugin,
  type LayerMarker,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import { Cursor, type LoroDoc, type LoroText } from "loro-crdt";
import { presenceClass, type Presence } from "../presence.ts";

/** How long a collaborator's name stays up after their cursor last moved. */
const NAME_VISIBLE_MS = 3000;
/** The height of the name, and the most of its width shown, in px. */
const NAME_HEIGHT = 16;
const NAME_MAX_WIDTH = 160;

/** What each editor puts in the presence store, under `${field}|${peerId}`. */
type SharedCursor = { name: string; anchor: Uint8Array; head: Uint8Array };
type RemoteCursor = { name: string; anchor: number; head: number };

const isSharedCursor = (value: unknown): value is SharedCursor =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "anchor" in value &&
  value.anchor instanceof Uint8Array &&
  "head" in value &&
  value.head instanceof Uint8Array;

const setCursors = StateEffect.define<RemoteCursor[]>();

const cursorsField = StateField.define<RemoteCursor[]>({
  create: () => [],
  update(cursors, tr) {
    for (const effect of tr.effects) if (effect.is(setCursors)) return effect.value;
    if (!tr.docChanged) return cursors;
    return cursors.map(({ name, anchor, head }) => ({
      name,
      anchor: tr.changes.mapPos(anchor),
      head: tr.changes.mapPos(head),
    }));
  },
});

const fadeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Shows the name for a while; hovering the caret shows it again. */
function showName(caret: HTMLElement) {
  clearTimeout(fadeTimers.get(caret));
  caret.toggleAttribute("data-active", true);
  fadeTimers.set(
    caret,
    setTimeout(() => caret.removeAttribute("data-active"), NAME_VISIBLE_MS),
  );
}

/**
 * A remote caret with its name. The name goes below the caret on the first line and to its left
 * near the right edge, so the editor never clips it.
 */
class CaretMarker implements LayerMarker {
  constructor(
    private left: number,
    private top: number,
    private height: number,
    private name: string,
    private end: boolean,
  ) {}

  draw() {
    const caret = document.createElement("div");
    this.update(caret);
    return caret;
  }

  update(caret: HTMLElement) {
    caret.className = `cm-remote-caret ${presenceClass(this.name)}`;
    caret.style.left = `${this.left}px`;
    caret.style.top = `${this.top}px`;
    caret.style.height = `${this.height}px`;
    caret.dataset.name = this.name;
    caret.toggleAttribute("data-below", this.top < NAME_HEIGHT);
    caret.toggleAttribute("data-end", this.end);
    showName(caret);
    return true;
  }

  eq(other: CaretMarker) {
    return (
      this.left === other.left &&
      this.top === other.top &&
      this.height === other.height &&
      this.name === other.name &&
      this.end === other.end
    );
  }
}

const cursorsChanged = (update: ViewUpdate) =>
  update.geometryChanged ||
  update.state.field(cursorsField) !== update.startState.field(cursorsField);

const clamp = (view: EditorView, pos: number) => Math.min(pos, view.state.doc.length);

const caretLayer = layer({
  above: true,
  class: "cm-remote-carets",
  update: cursorsChanged,
  markers(view) {
    const scroller = view.scrollDOM;
    const base = scroller.getBoundingClientRect();
    return view.state.field(cursorsField).flatMap(({ name, head }) => {
      const coords = view.coordsAtPos(clamp(view, head), 1);
      if (!coords) return [];
      const left = coords.left - base.left + scroller.scrollLeft;
      const top = coords.top - base.top + scroller.scrollTop;
      const end = left > scroller.clientWidth - NAME_MAX_WIDTH;
      return [new CaretMarker(left, top, coords.bottom - coords.top, name, end)];
    });
  },
});

const selectionLayer = layer({
  above: false,
  class: "cm-remote-selections",
  update: cursorsChanged,
  markers: (view) =>
    view.state
      .field(cursorsField)
      .filter(({ anchor, head }) => anchor !== head)
      .flatMap(({ name, anchor, head }) =>
        RectangleMarker.forRange(
          view,
          `cm-remote-selection ${presenceClass(name)}`,
          EditorSelection.range(clamp(view, anchor), clamp(view, head)),
        ),
      ),
});

const theme = EditorView.theme({
  ".cm-remote-caret": { position: "absolute", width: "2px", backgroundColor: "var(--presence)" },
  ".cm-remote-caret::after": {
    content: '""',
    position: "absolute",
    top: "-2px",
    left: "-2px",
    width: "6px",
    height: "6px",
    borderRadius: "1px",
    backgroundColor: "var(--presence)",
  },
  ".cm-remote-caret::before": {
    content: "attr(data-name)",
    position: "absolute",
    zIndex: "1",
    bottom: "100%",
    left: "0",
    maxWidth: `${NAME_MAX_WIDTH}px`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    userSelect: "none",
    padding: "0 4px",
    borderRadius: "3px 3px 3px 0",
    fontFamily: "var(--font-sans)",
    fontSize: "11px",
    fontWeight: "500",
    lineHeight: `${NAME_HEIGHT}px`,
    color: "var(--presence-ink, white)",
    backgroundColor: "var(--presence)",
    opacity: "0",
    transition: "opacity 0.2s",
  },
  ".cm-remote-caret[data-active]::before, .cm-remote-caret:hover::before": { opacity: "1" },
  ".cm-remote-caret[data-below]::before": {
    top: "100%",
    bottom: "auto",
    borderRadius: "0 3px 3px 3px",
  },
  ".cm-remote-caret[data-end]::before": { left: "auto", right: "0" },
  ".cm-remote-caret[data-end]:not([data-below])::before": { borderRadius: "3px 3px 0 3px" },
  ".cm-remote-caret[data-end][data-below]::before": { borderRadius: "3px 0 3px 3px" },
  ".cm-remote-selection": {
    backgroundColor: "color-mix(in oklab, var(--presence) 25%, transparent)",
  },
});

/**
 * Shares this editor's selection under its field's prefix and shows everyone else's there. Remote
 * cursors resolve again after every import: one that arrives before the edit it points into would
 * otherwise stay at a stale offset.
 */
class CursorSync implements PluginValue {
  private prefix: string;
  private key: string;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe: (() => void)[];

  constructor(
    private view: EditorView,
    private doc: LoroDoc,
    private presence: Presence,
    field: string,
    private name: string,
    private getText: () => LoroText,
  ) {
    this.prefix = `${field}|`;
    this.key = this.prefix + doc.peerIdStr;
    this.unsubscribe = [
      presence.store.subscribe(({ by, added, updated, removed }) => {
        const keys = [...added, ...updated, ...removed];
        if (by !== "local" && keys.some((key) => key.startsWith(this.prefix))) this.resolve();
      }),
      doc.subscribe(({ by }) => by === "import" && this.resolve()),
    ];
    this.resolve();
  }

  /** Deferred, as imports reach the view in a dispatch of their own. */
  private resolve() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const offset = (bytes: Uint8Array) => this.doc.getCursorPos(Cursor.decode(bytes))?.offset;
      const cursors = this.presence.others().flatMap(([key, value]) => {
        if (!key.startsWith(this.prefix) || !isSharedCursor(value)) return [];
        try {
          const [anchor, head] = [offset(value.anchor), offset(value.head)];
          return anchor === undefined || head === undefined
            ? []
            : [{ name: value.name, anchor, head }];
        } catch {
          return [];
        }
      });
      this.view.dispatch({ effects: setCursors.of(cursors) });
    });
  }

  update(update: ViewUpdate) {
    if (!update.selectionSet && !update.focusChanged && !update.docChanged) return;
    if (!this.view.hasFocus) {
      if (update.focusChanged) this.presence.delete(this.key);
      return;
    }
    const { anchor, head } = update.state.selection.main;
    const text = this.getText();
    const [anchorCursor, headCursor] = [text.getCursor(anchor), text.getCursor(head)];
    if (!anchorCursor || !headCursor) return;
    this.presence.set(this.key, {
      name: this.name,
      anchor: anchorCursor.encode(),
      head: headCursor.encode(),
    });
  }

  destroy() {
    clearTimeout(this.timer);
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.presence.delete(this.key);
  }
}

/** Remote cursors for one text field; `field` keeps each field's cursors apart in the doc's presence. */
export function loroCursors(
  doc: LoroDoc,
  presence: Presence,
  field: string,
  name: string,
  getText: () => LoroText,
) {
  return [
    cursorsField,
    caretLayer,
    selectionLayer,
    theme,
    ViewPlugin.define((view) => new CursorSync(view, doc, presence, field, name, getText)),
  ];
}
