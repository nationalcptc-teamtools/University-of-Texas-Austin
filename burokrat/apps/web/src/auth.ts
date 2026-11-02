import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  endSession,
  getSession,
  loginBlocked,
  passcodeMatches,
  recordFailedLogin,
  startSession,
} from "./server/session.server.ts";

export const getSessionFn = createServerFn().handler(() => getSession());

const LoginInput = z.object({
  name: z.string().trim().min(1).max(40),
  passcode: z.string().min(1).max(200),
});

export const loginFn = createServerFn({ method: "POST" })
  .validator(LoginInput)
  .handler(async ({ data }) => {
    if (loginBlocked()) {
      return { ok: false as const, error: "Too many failed attempts. Try again later." };
    }
    if (!passcodeMatches(data.passcode)) {
      recordFailedLogin();
      return { ok: false as const, error: "Wrong passcode." };
    }
    await startSession({ name: data.name });
    return { ok: true as const };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(() => endSession());

export function safeRedirect(target: string | undefined) {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}
