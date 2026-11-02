import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { SyncedInput } from "./SyncedInput.tsx";

test("someone else's change keeps the caret where it was in the text", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (value: string) =>
    flushSync(() => root.render(<SyncedInput aria-label="Subtitle" value={value} />));
  render("hello world");
  const input = container.querySelector("input")!;
  input.focus();
  input.setSelectionRange(6, 9, "forward");
  await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");

  render("oh, hello world");

  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 12]);
});
