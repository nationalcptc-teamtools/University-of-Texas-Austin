import { toasts } from "./toasts.ts";

/** Copies `text` and says in a toast what was copied, with `note` if there is something to add. */
export async function copyText(text: string, what: string, note?: string) {
  try {
    await navigator.clipboard.writeText(text);
    toasts.add({ title: `Copied ${what}`, description: note });
  } catch {
    toasts.add({ title: `Could not copy ${what}`, variant: "error" });
  }
}
