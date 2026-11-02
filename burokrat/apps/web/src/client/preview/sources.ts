import type { TypstInput } from "@burokrat/typst/browser";
import type { LoroDoc } from "loro-crdt";
import { useEffect, useState } from "react";

/**
 * What `read` takes from the doc, read again after every local or remote commit and when `doc`
 * or `read` changes. `read` must keep its identity across renders.
 */
export function useDocValue<T>(doc: LoroDoc, read: (doc: LoroDoc) => T) {
  const [state, setState] = useState(() => ({ doc, read, value: read(doc) }));
  if (state.doc !== doc || state.read !== read) setState({ doc, read, value: read(doc) });
  useEffect(() => doc.subscribe(() => setState({ doc, read, value: read(doc) })), [doc, read]);
  return state.value;
}

/** Shaping throws on content the PDF would reject too; the preview shows why. */
export function attempt(shape: () => TypstInput): { input?: TypstInput; error?: string } {
  try {
    return { input: shape() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
