import { createHash, timingSafeEqual } from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server";
import {
  COOKIE,
  MAX_AGE_SECONDS,
  readSession,
  sealSession,
  type Session,
} from "./sealed-session.server.ts";

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const failedLogins = new Map<string, { count: number; resetAt: number }>();

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function passcodeMatches(input: string) {
  const expected = process.env.BUROKRAT_PASSCODE;
  if (!expected) throw new Error("BUROKRAT_PASSCODE must be set");
  return timingSafeEqual(sha256(input), sha256(expected));
}

export function loginBlocked() {
  const entry = failedLogins.get(clientKey());
  return entry !== undefined && entry.resetAt > Date.now() && entry.count >= MAX_FAILED_LOGINS;
}

export function recordFailedLogin() {
  const key = clientKey();
  const entry = failedLogins.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    failedLogins.set(key, { count: 1, resetAt: Date.now() + FAILED_LOGIN_WINDOW_MS });
  } else {
    entry.count++;
  }
}

/**
 * The client's address. Behind `TRUST_PROXY` reverse proxies, it is the X-Forwarded-For entry the
 * outermost one added: entries left of it are whatever the client sent.
 */
function clientKey() {
  const hops = Number(process.env.TRUST_PROXY) || 0;
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",") ?? [];
  const address = hops > 0 ? forwarded.at(-hops)?.trim() : undefined;
  return address || (getRequestIP({ xForwardedFor: false }) ?? "unknown");
}

export function getSession() {
  return readSession(getCookie(COOKIE));
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  return session;
}

export async function startSession(session: Session) {
  setCookie(COOKIE, await sealSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestProtocol() === "https",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}
