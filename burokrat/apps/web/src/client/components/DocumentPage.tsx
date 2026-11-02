import { Button, Sidebar, useSidebar } from "@cloudflare/kumo";
import { EditorView } from "@codemirror/view";
import { ClockCounterClockwiseIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import type { LoroDoc } from "loro-crdt";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { HistoryBar } from "../history/HistoryBar.tsx";
import type { Scope } from "../history/versions.ts";
import { NO_PROBLEMS, PreviewContext, type Problems } from "../preview/context.ts";
import { warmPreview } from "../preview/TypstPreview.tsx";
import { storedWidth, storeWidth } from "../stored-width.ts";
import { useOnline } from "../use-connection.ts";
import { PageHeader, ToolbarLabel } from "./PageHeader.tsx";
import { PageViewers } from "./PageViewers.tsx";
import { PdfButton } from "./PdfButton.tsx";
import { ProblemsBanner } from "./ProblemsBanner.tsx";

type Props = {
  title: ReactNode;
  pdfHref: string;
  actions?: ReactNode;
  /** The open doc, once it has loaded. */
  doc?: LoroDoc;
  /** The part of `doc` the page edits, whose history it shows. */
  scope: Scope;
  /** The preview of `doc`, or of a copy of it at an earlier version. */
  preview: (doc: LoroDoc) => ReactNode;
  children: ReactNode;
};

const WIDTH_KEY = "burokrat:preview-width";
const MIN_WIDTH = 320;
/** Below this, Kumo shows the preview as a sheet over the editor, so it starts closed. */
const WIDE = "(min-width: 768px)";

/** Leaves room for the projects sidebar and a usable editor. */
function maxWidth(windowWidth = window.innerWidth) {
  return Math.max(MIN_WIDTH, windowWidth - 640);
}

function subscribeToResize(onResize: () => void) {
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

function useWindowWidth() {
  return useSyncExternalStore(subscribeToResize, () => window.innerWidth);
}

/**
 * Narrows the preview with the window. Kumo clamps the width only while it is dragged, and its
 * context keeps the first `maxWidth` it was given, so the bound comes in as a prop.
 */
function FitWidth({ max }: { max: number }) {
  const { width, setWidth } = useSidebar();
  useEffect(() => {
    if (width > max) setWidth(max);
  }, [width, max, setWidth]);
  return null;
}

/** Where the caret is in the field `target` belongs to, if it can tell. */
function caretIn(target: Element) {
  if (target instanceof HTMLInputElement) return target.selectionStart ?? undefined;
  const editor = target.closest<HTMLElement>(".cm-editor");
  return editor ? EditorView.findFromDOM(editor)?.state.selection.main.head : undefined;
}

/** Puts the cursor at `offset` in the editor inside `[data-anchor="field"]`, and scrolls to it. */
function jumpTo(editors: HTMLElement | null, field: string, offset: number) {
  const element = editors?.querySelector<HTMLElement>(
    `[data-anchor="${CSS.escape(field)}"] .cm-editor`,
  );
  const view = element && EditorView.findFromDOM(element);
  if (!view) return;
  const anchor = Math.min(offset, view.state.doc.length);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
  view.focus();
}

function savedWidth() {
  return Math.min(storedWidth(WIDTH_KEY) ?? window.innerWidth * 0.4, maxWidth());
}

/**
 * A toolbar over an editor column, and a resizable preview beside it that the reader toggles.
 * Typing in an element marked `data-anchor` scrolls the preview to the caret in that field, and
 * clicking a word in the preview puts the cursor on it in that field's editor. The document is
 * compiled even while the preview is closed or shows an earlier version, and its Typst errors
 * show above the editor and disable the PDF button, as the PDF would not build.
 */
export function DocumentPage({ title, pdfHref, actions, doc, scope, preview, children }: Props) {
  const [showPreview, setShowPreview] = useState(() => matchMedia(WIDE).matches);
  const [showHistory, setShowHistory] = useState(false);
  const [past, setPast] = useState<LoroDoc>();
  const [field, setField] = useState<{ name: string; offset?: number }>();
  const [problems, setProblems] = useState<Problems>(NO_PROBLEMS);
  const online = useOnline();
  const scroller = useRef<HTMLDivElement>(null);
  const editors = useRef<HTMLDivElement>(null);
  const widest = maxWidth(useWindowWidth());

  const hasProblems = problems.broken.length > 0 || problems.errors.length > 0;
  const previewContext = {
    field,
    scroller,
    onJump: (name: string, offset: number) => jumpTo(editors.current, name, offset),
  };

  useEffect(() => warmPreview(), []);

  return (
    <>
      <PageHeader title={title}>
        <PageViewers />
        {actions}
        <PdfButton href={pdfHref} disabled={hasProblems || !online} />
        <Button
          variant="secondary"
          icon={ClockCounterClockwiseIcon}
          aria-pressed={showHistory}
          disabled={!doc}
          onClick={() => {
            setShowHistory((shown) => !shown);
            setShowPreview(true);
          }}
        >
          <ToolbarLabel>History</ToolbarLabel>
        </Button>
        <Button
          variant="secondary"
          icon={showPreview ? EyeSlashIcon : EyeIcon}
          aria-pressed={showPreview}
          onClick={() => setShowPreview((shown) => !shown)}
        >
          <ToolbarLabel>Preview</ToolbarLabel>
        </Button>
      </PageHeader>
      {showHistory && doc && (
        <HistoryBar
          key={`${doc.peerIdStr} ${String(scope)}`}
          doc={doc}
          scope={scope}
          onShow={setPast}
          onClose={() => setShowHistory(false)}
        />
      )}
      <Sidebar.Provider
        side="right"
        collapsible="offcanvas"
        resizable
        contained
        defaultWidth={savedWidth()}
        minWidth={MIN_WIDTH}
        maxWidth={widest}
        onWidthChange={(width) => storeWidth(WIDTH_KEY, width)}
        open={showPreview}
        onOpenChange={setShowPreview}
        className="min-h-0 flex-1 [--sidebar-bg:var(--color-kumo-tint)]"
      >
        <FitWidth max={widest} />
        <div
          ref={editors}
          inert={past !== undefined}
          className="relative min-w-0 flex-1 overflow-y-auto"
          onInput={(event) => {
            const target = event.target as Element;
            const name = target.closest<HTMLElement>("[data-anchor]")?.dataset.anchor;
            if (name) setField({ name, offset: caretIn(target) });
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-5">
            <ProblemsBanner problems={problems} />
            <div>{children}</div>
          </div>
          {doc && (!showPreview || past) && (
            <div hidden>
              <PreviewContext value={{ visible: false, onProblemsChange: setProblems }}>
                {preview(doc)}
              </PreviewContext>
            </div>
          )}
        </div>
        <Sidebar aria-label="Preview">
          <Sidebar.ResizeHandle aria-label="Resize preview" />
          <div
            ref={scroller}
            className="h-full overflow-x-hidden overflow-y-auto p-4 whitespace-normal"
          >
            <PreviewContext
              value={past ? previewContext : { ...previewContext, onProblemsChange: setProblems }}
            >
              {showPreview && doc && preview(past ?? doc)}
            </PreviewContext>
          </div>
        </Sidebar>
      </Sidebar.Provider>
    </>
  );
}
