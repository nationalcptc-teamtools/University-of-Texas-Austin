/** The width a pane was last dragged to, or undefined before the first drag. */
export function storedWidth(key: string) {
  try {
    return Number(localStorage.getItem(key)) || undefined;
  } catch {
    // Without storage the pane starts at its default width.
    return undefined;
  }
}

export function storeWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // The width is a convenience; without storage it resets on reload.
  }
}
