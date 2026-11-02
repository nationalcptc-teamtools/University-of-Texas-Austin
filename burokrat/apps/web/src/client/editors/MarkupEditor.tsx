import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderText } from "@codemirror/view";
import type { LoroText } from "loro-crdt";
import { useEffect, useId, useRef } from "react";
import type { DocSession } from "../sync-client.ts";
import { originOf } from "../undo-registry.ts";
import { formatKeymap } from "./format.ts";
import { loroCursors } from "./loro-cursors.ts";
import { loroSync, loroSyncAnnotation } from "./loro-sync.ts";
import { loroUndo } from "./loro-undo.ts";
import { typst } from "./typst.ts";

const MAX_LENGTH = 100_000;

const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-kumo-base)",
    color: "var(--text-color-kumo-default)",
    borderRadius: "0.5rem",
    boxShadow: "0 0 0 1px var(--color-kumo-line)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "2px solid var(--color-kumo-focus)" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "0.5rem 0",
    minHeight: "4.5rem",
    caretColor: "currentColor",
  },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-placeholder": { color: "var(--text-color-kumo-placeholder)" },
  // CodeMirror styles tooltips for a light page only.
  ".cm-tooltip": {
    overflow: "hidden",
    border: "none",
    borderRadius: "0.5rem",
    backgroundColor: "var(--color-kumo-base)",
    color: "var(--text-color-kumo-default)",
    boxShadow: "0 0 0 1px var(--color-kumo-line), 0 4px 12px rgb(0 0 0 / 0.15)",
  },
  ".cm-diagnostic": { padding: "0.375rem 0.75rem", fontSize: "0.875rem" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--color-kumo-danger)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--color-kumo-warning)" },
  ".cm-diagnosticSource": { color: "var(--text-color-kumo-subtle)", opacity: "1" },
});

/** Uploads each pasted image with `attach`, then writes `#image("name")` where the cursor is. */
async function insertImages(
  view: EditorView,
  files: File[],
  attach: (file: File) => Promise<string | undefined>,
) {
  for (const file of files) {
    const name = await attach(file);
    if (!name || !view.dom.isConnected) continue;
    view.dispatch({
      ...view.state.replaceSelection(`#image("${name}")`),
      scrollIntoView: true,
      userEvent: "input.paste",
    });
  }
}

type Props = {
  session: DocSession;
  /** The undo unit and presence namespace, unique within the doc. */
  unit: string;
  getText: () => LoroText;
  userName: string;
  label: string;
  placeholder?: string;
  /** Plain text, as notes are: no Typst highlighting or formatting keys. */
  plain?: boolean;
  /** Takes a pasted image and resolves to the name `#image` shows it by. */
  onPasteImage?: (file: File) => Promise<string | undefined>;
};

/** A CodeMirror field bound to one LoroText, with its own undo stack and remote cursors. */
export function MarkupEditor({
  session,
  unit,
  getText,
  userName,
  label,
  placeholder,
  plain = false,
  onPasteImage,
}: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const getTextRef = useRef(getText);
  const pasteImageRef = useRef(onPasteImage);
  useEffect(() => {
    const { doc, presence, undo } = session;
    const text = () => getTextRef.current();
    const view = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: text().toString(),
        extensions: [
          plain ? [] : formatKeymap,
          keymap.of(defaultKeymap),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-labelledby": labelId }),
          EditorState.changeFilter.of(
            (tr) =>
              tr.annotation(loroSyncAnnotation) !== undefined || tr.newDoc.length <= MAX_LENGTH,
          ),
          placeholder ? placeholderText(placeholder) : [],
          EditorView.domEventHandlers({
            paste(event, view) {
              const attach = pasteImageRef.current;
              const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!attach || files.length === 0) return false;
              event.preventDefault();
              void insertImages(view, files, attach);
              return true;
            },
          }),
          theme,
          plain ? [] : typst,
          loroSync(doc, text, originOf(unit)),
          loroUndo(doc, undo.get(unit), text),
          loroCursors(doc, presence, unit, userName, text),
        ],
      }),
    });
    return () => view.destroy();
  }, [session, unit, userName, labelId, placeholder, plain]);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-kumo-default">
        {label}
      </span>
      <div ref={parent} />
    </div>
  );
}
