import { createFileRoute, redirect } from "@tanstack/react-router";
import { projectsCollection } from "../../client/collections.ts";

/** The server holds one engagement: the newest project, or setup when there is none. */
export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    await projectsCollection.preload();
    const newest = projectsCollection.toArray.toSorted(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
    if (newest) throw redirect({ to: "/p/$projectId", params: { projectId: newest.id } });
    throw redirect({ to: "/setup" });
  },
});
