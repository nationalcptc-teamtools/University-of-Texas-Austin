import { getSessionFn } from "../auth.ts";
import { forgetPendingFiles } from "./files.ts";
import { forgetLocalCopies } from "./local-docs.ts";
import { forgetLists } from "./saved-lists.ts";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionFn>>>;

const KEY = "burokrat:session";

function savedSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage, signing in needs the server each time.
  }
}

/** The signed-in session, or the last one this device saw while the server can't be reached. */
export async function currentSession() {
  try {
    const session = await getSessionFn();
    saveSession(session);
    return session;
  } catch (error) {
    const saved = savedSession();
    if (saved) return saved;
    throw error;
  }
}

/** Deletes everything kept on this device for working offline, for signing out. */
export async function forgetDevice() {
  saveSession(null);
  await Promise.all([
    forgetLocalCopies(),
    forgetLists(),
    forgetPendingFiles(),
    caches?.delete("images"),
  ]);
}
