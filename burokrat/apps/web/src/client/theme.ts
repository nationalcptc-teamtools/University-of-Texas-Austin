export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "burokrat:theme";

/** Runs in the head before the first paint, so a saved theme never flashes the other one. */
export const THEME_SCRIPT = `try{var m=localStorage.getItem("${KEY}");if(m==="light"||m==="dark")document.documentElement.dataset.mode=m}catch(e){}`;

export function savedTheme(): Theme {
  try {
    const theme = localStorage.getItem(KEY);
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

/** Kumo reads `data-mode` on the root; without it the page follows the system setting. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.mode;
  else root.dataset.mode = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Without storage the choice lasts until reload.
  }
}
