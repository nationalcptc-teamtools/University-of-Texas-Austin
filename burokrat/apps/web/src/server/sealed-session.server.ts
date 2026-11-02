import { sealData, unsealData } from "iron-session";

export type Session = { name: string };

export const COOKIE = "burokrat_session";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return value;
}

export function sealSession(session: Session) {
  return sealData(session, { password: secret(), ttl: MAX_AGE_SECONDS });
}

/** Unseals the session cookie. Has no Start imports, so the sync server can use it too. */
export async function readSession(sealed: string | undefined): Promise<Session | null> {
  if (!sealed) return null;
  const data = await unsealData<Partial<Session>>(sealed, {
    password: secret(),
    ttl: MAX_AGE_SECONDS,
  });
  return typeof data.name === "string" && data.name ? { name: data.name } : null;
}
