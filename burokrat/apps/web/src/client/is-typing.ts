/** Whether a key or paste goes into a field, so a page shortcut should leave it alone. */
export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));
