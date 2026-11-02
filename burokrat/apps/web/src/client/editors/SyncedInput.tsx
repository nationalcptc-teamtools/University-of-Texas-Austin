import { Input, type InputProps } from "@cloudflare/kumo";
import { useLayoutEffect, useRef } from "react";
import { moveIndex } from "./text-index.ts";

type Props = InputProps & { value: string };

/** An input for a synced value: when someone else changes it, the caret stays put in the text. */
export function SyncedInput({ value, onChange, onSelect, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const seen = useRef({ value, start: 0, end: 0 });

  function remember(element: HTMLInputElement) {
    seen.current = {
      value: element.value,
      start: element.selectionStart ?? 0,
      end: element.selectionEnd ?? 0,
    };
  }

  useLayoutEffect(() => {
    const element = input.current;
    const before = seen.current;
    if (!element || before.value === value) return;
    if (element === document.activeElement) {
      element.setSelectionRange(
        moveIndex(before.value, value, before.start),
        moveIndex(before.value, value, before.end),
      );
    }
    remember(element);
  }, [value]);

  return (
    <Input
      {...props}
      ref={input}
      value={value}
      onSelect={(event) => {
        remember(event.currentTarget);
        onSelect?.(event);
      }}
      onChange={(event) => {
        remember(event.currentTarget);
        onChange?.(event);
      }}
    />
  );
}
