import { Input } from "@cloudflare/kumo";
import type { LoroText } from "loro-crdt";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocSession } from "../sync-client.ts";
import { originOf, undoKey } from "../undo-registry.ts";
import { mapIndex } from "./text-index.ts";

type Props = {
  session: DocSession;
  unit: string;
  getText: () => LoroText;
  label: string;
  placeholder?: string;
  maxLength?: number;
};

/** A one-line input bound to a LoroText, so concurrent edits merge, with its own undo stack. */
export function TextInput({ session, unit, getText, label, placeholder, maxLength }: Props) {
  const [value, setValue] = useState(() => getText().toString());
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<[number, number]>(undefined);
  const undo = session.undo.get(unit);

  useEffect(
    () =>
      session.doc.subscribe((batch) => {
        const text = getText();
        for (const { target, diff } of batch.events) {
          if (target !== text.id) continue;
          const element = input.current;
          // Setting the value moves the caret to the end; someone else's edit should not.
          if (batch.by === "import" && diff.type === "text" && element === document.activeElement) {
            const { selectionStart, selectionEnd } = element as HTMLInputElement;
            selection.current = [
              mapIndex(diff, selectionStart ?? 0),
              mapIndex(diff, selectionEnd ?? 0),
            ];
          }
          setValue(text.toString());
        }
      }),
    [session, getText],
  );

  useLayoutEffect(() => {
    if (!selection.current) return;
    input.current?.setSelectionRange(...selection.current);
    selection.current = undefined;
  }, [value]);

  return (
    <Input
      ref={input}
      label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={value}
      onKeyDown={(event) => undoKey(event, undo)}
      onChange={(event) => {
        setValue(event.target.value);
        getText().update(event.target.value);
        session.doc.commit({ origin: originOf(unit) });
      }}
    />
  );
}
