import type { BrokenField } from "@burokrat/typst/browser";
import { createContext, type RefObject } from "react";

/** What stops the PDF building: text fields that fail on their own, and Typst's errors. */
export type Problems = { broken: BrokenField[]; errors: string[] };

export const NO_PROBLEMS: Problems = { broken: [], errors: [] };

/**
 * What the page around a preview gives it: whether it is on screen, the editor field last typed
 * in and where its caret was, the element it scrolls within, where to report what stops the PDF
 * building, and where to send a click on a word: the field's `data-anchor` and the word's offset
 * in it. A preview off screen only checks the document, less often, and draws nothing.
 */
export const PreviewContext = createContext<{
  visible?: boolean;
  field?: { name: string; offset?: number };
  scroller?: RefObject<HTMLElement | null>;
  onProblemsChange?: (problems: Problems) => void;
  onJump?: (field: string, offset: number) => void;
}>({});
