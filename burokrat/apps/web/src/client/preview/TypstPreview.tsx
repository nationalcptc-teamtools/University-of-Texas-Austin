import type { BrokenField, JobKind, TypstInput } from "@burokrat/typst/browser";
import { Loader, Text } from "@cloudflare/kumo";
import {
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useThrottled } from "../use-throttled.ts";
import { compilePages, getWorker, type Anchor, type Page } from "./compiler.ts";
import { NO_PROBLEMS, PreviewContext } from "./context.ts";
import { jumpAt, jumpBefore, type Jump } from "./jumps.ts";

/**
 * Starts loading the compiler and renderer while the document is still syncing. A worker that
 * fails to load is reported by the first compile.
 */
export function warmPreview() {
  getWorker().catch(() => undefined);
}

/** The width pages are drawn at: the preview's, in this screen's pixels. */
function drawWidth(element: HTMLElement) {
  return Math.round(element.clientWidth * devicePixelRatio);
}

/** How long after typing a new compile scrolls to the caret again, as words move. */
const FOLLOW_MS = 3000;

/** Scrolls `y` on `page` a third of the way down, unless it is already in view. */
function revealPoint(scroller: HTMLElement, pages: HTMLCanvasElement[], page: number, y: number) {
  const box = pages[page - 1]?.getBoundingClientRect();
  if (!box) return;
  const view = scroller.getBoundingClientRect();
  const top = box.top - view.top + y * box.height;
  const margin = 48;
  if (top > margin && top < view.height - margin) return;
  scroller.scrollBy({ top: top - view.height / 3 });
}

/**
 * Scrolls to the word before the caret in the field typed in. Without one, as in a field with no
 * plain text, it jumps to where the field starts, unless some of the field is already in view.
 */
function reveal(
  scroller: HTMLElement,
  pages: HTMLCanvasElement[],
  { anchors, jumps }: Pick<Shown, "anchors" | "jumps">,
  { name, offset: caret }: { name: string; offset?: number },
) {
  const word = caret === undefined ? undefined : jumpBefore(jumps, name, caret);
  if (word) return revealPoint(scroller, pages, word.page, word.y);
  const index = anchors.findIndex((anchor) => anchor.name === name);
  const last = pages.at(-1);
  if (index < 0 || !last) return;
  const view = scroller.getBoundingClientRect();
  const offset = ({ page, y }: Anchor) => {
    const box = pages[page - 1]?.getBoundingClientRect();
    return box ? box.top - view.top + y * box.height : 0;
  };
  const top = offset(anchors[index]!);
  const next = anchors[index + 1];
  const bottom = next ? offset(next) : last.getBoundingClientRect().bottom - view.top;
  const margin = 48;
  if (top < view.height - margin && bottom > margin) return;
  scroller.scrollBy({ top: top - 16 });
}

type Shown = {
  pages: Page[];
  anchors: Anchor[];
  jumps: Jump[];
  broken: BrokenField[];
  errors: string[];
};

const NOTHING_SHOWN: Shown = { pages: [], anchors: [], jumps: [], broken: [], errors: [] };

/** The shortest time between two checks of a document whose preview is off screen. */
const HIDDEN_COMPILE_MS = 3000;

type Props = {
  projectId: string;
  kind: JobKind;
  /** The input to show, or why there is none. */
  input?: TypstInput;
  error?: string;
};

/**
 * Compiles and draws the pages in a worker; this thread only shows the finished bitmaps. A failed
 * compile keeps the last pages up, and reports its errors to the page.
 */
export function TypstPreview({ projectId, kind, input, error }: Props) {
  const view = useId();
  const { visible = true, field, scroller, onProblemsChange, onJump } = use(PreviewContext);
  const throttled = useThrottled(input, HIDDEN_COMPILE_MS);
  const compiled = visible ? input : throttled;
  const host = useRef<HTMLDivElement>(null);
  const canvases = useRef<HTMLCanvasElement[]>([]);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(NOTHING_SHOWN);
  const [answered, setAnswered] = useState<{ input: TypstInput; width: number }>();
  const busy = input !== undefined && (answered?.input !== input || answered.width !== width);

  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setWidth(drawWidth(element));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Every reply is shown, even a stale one: the worker only redraws pages that changed since.
  // Off screen, nothing is drawn: a width of 0 asks the worker only to compile.
  useEffect(() => {
    if (!compiled || (visible && width === 0)) return;
    compilePages(projectId, kind, compiled, view, visible ? width : 0).then(
      (reply) => {
        if (!reply) return;
        if (reply.pages) setShown({ ...reply, errors: [] });
        else setShown((last) => ({ ...last, errors: reply.errors }));
        setAnswered({ input: compiled, width });
      },
      (failure: Error) => {
        setShown((last) => ({ ...last, errors: [failure.message] }));
        setAnswered({ input: compiled, width });
      },
    );
  }, [projectId, kind, compiled, view, visible, width]);

  // A bitmap moves into its canvas, which leaves it detached with no width: it is drawn once.
  useLayoutEffect(() => {
    canvases.current.length = shown.pages.length;
    for (const [index, { bitmap }] of shown.pages.entries()) {
      const canvas = canvases.current[index];
      if (!bitmap?.width || !canvas) continue;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
    }
  }, [shown.pages]);

  const errors = useMemo(() => (error ? [error] : shown.errors), [error, shown.errors]);
  const { broken } = shown;
  useEffect(() => {
    onProblemsChange?.({ broken, errors });
    return () => onProblemsChange?.(NO_PROBLEMS);
  }, [broken, errors, onProblemsChange]);

  // Follows the caret when typing, and again as the pages drawn since move its word.
  const followed = useRef<{ field?: typeof field; at: number }>({ at: 0 });
  useLayoutEffect(() => {
    if (!field || !scroller?.current) return;
    if (followed.current.field !== field) followed.current = { field, at: Date.now() };
    else if (Date.now() - followed.current.at > FOLLOW_MS) return;
    reveal(scroller.current, canvases.current, shown, field);
  }, [field, scroller, shown]);

  function jump(event: MouseEvent<HTMLCanvasElement>, page: number) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const found = jumpAt(shown.jumps, page, x, y);
    if (found) onJump?.(found.field, found.offset);
  }

  const { pages } = shown;
  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      {pages.length === 0 &&
        (errors.length > 0 || broken.length > 0 ? (
          <Text variant="secondary">The preview shows once the Typst errors are fixed.</Text>
        ) : (
          <Loader className="self-center" />
        ))}
      <div ref={host} className="flex flex-col gap-2">
        {pages.map((page, index) => (
          <canvas
            key={index}
            ref={(canvas) => void (canvas && (canvases.current[index] = canvas))}
            role="img"
            aria-label={`Page ${index + 1}`}
            className="block w-full bg-white"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
            onClick={(event) => jump(event, index + 1)}
          />
        ))}
      </div>
    </div>
  );
}
