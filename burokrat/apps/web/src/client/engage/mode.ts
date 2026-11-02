export type Mode = "engage" | "report";

const KEY = "burokrat:mode";

/** Engage pages live under `/p/:id/engage`; every other project page is Report's. */
export const modeOf = (path: string, base: string): Mode =>
  path === `${base}/engage` || path.startsWith(`${base}/engage/`) ? "engage" : "report";

/** The mode this device was last in, which opening a project goes back to. */
export function storedMode(): Mode {
  try {
    return localStorage.getItem(KEY) === "engage" ? "engage" : "report";
  } catch {
    // Without storage a project opens in Report, as it did before Engage.
    return "report";
  }
}

export function storeMode(mode: Mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // The mode is a convenience; without storage it resets on reload.
  }
}
