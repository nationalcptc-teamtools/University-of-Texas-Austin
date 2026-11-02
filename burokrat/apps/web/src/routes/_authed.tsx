import { createFileRoute, redirect } from "@tanstack/react-router";
import { currentSession } from "../client/offline-session.ts";
import { restoreLists } from "../client/saved-lists.ts";

export const Route = createFileRoute("/_authed")({
  // TanStack DB collections and Loro docs live in the browser only.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const [session] = await Promise.all([currentSession(), restoreLists()]);
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };
  },
});
