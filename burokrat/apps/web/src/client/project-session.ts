import { projectMirrorSchema, type ProjectDraft, type ProjectState } from "@burokrat/domain";
import { Mirror } from "loro-mirror";
import { useLoroValue } from "loro-mirror-react";
import { createContext, useContext, useEffect, useState } from "react";
import { openDoc, type DocSession } from "./sync-client.ts";
import { toasts } from "./toasts.ts";
import { originOf } from "./undo-registry.ts";

export type ProjectStore = Mirror<typeof projectMirrorSchema>;

/** The open project doc, and its typed state for the form fields. */
export type ProjectSession = DocSession & { projectId: string; store: ProjectStore };

type ProjectDocState =
  | { id: string; status: "loading"; session?: undefined }
  | { id: string; status: "removed"; session?: undefined }
  | { id: string; status: "ready"; session: ProjectSession };

async function openProject(projectId: string, author: string, onRemoved: () => void) {
  const session = await openDoc(`project:${projectId}`, author, onRemoved);
  const store = new Mirror({ doc: session.doc, schema: projectMirrorSchema });
  const close = () => {
    store.dispose();
    session.close();
  };
  return { ...session, projectId, store, close } satisfies ProjectSession;
}

/** Opens the project's synced doc, as `author`, for as long as the component is mounted. */
export function useProjectDoc(projectId: string, author: string): ProjectDocState {
  const [state, setState] = useState<ProjectDocState>({ id: projectId, status: "loading" });

  useEffect(() => {
    let closed = false;
    let opened = false;
    const removed = () => !closed && setState({ id: projectId, status: "removed" });
    const open = (onEvicted: () => void) =>
      openProject(projectId, author, onEvicted).then((session) => {
        if (closed) return session.close();
        opened = true;
        setState({ id: projectId, status: "ready", session });
        return true;
      }, removed);
    // The server evicts on a rejected edit; rejoining resyncs, and fails if the project is gone.
    const reopen = () => {
      if (!opened || closed) return removed();
      void open(removed).then(
        (reopened) =>
          reopened &&
          toasts.add({
            title: "Your last change could not be saved",
            description: "The project was reloaded from the server.",
            variant: "error",
          }),
      );
    };
    void open(reopen);
    return () => {
      closed = true;
    };
  }, [projectId, author]);

  useEffect(() => {
    const { session } = state;
    return () => session?.close();
  }, [state]);

  return state.id === projectId ? state : { id: projectId, status: "loading" };
}

export const ProjectSessionContext = createContext<ProjectSession | undefined>(undefined);

/** The project open in the layout around this page. */
export function useProjectSession() {
  const session = useContext(ProjectSessionContext);
  if (!session) throw new Error("No project is open");
  return session;
}

/**
 * Part of the project's state, re-rendering only when that part changes. `select` must keep its
 * identity across renders.
 */
export function useProjectState<R>(select: (state: ProjectState) => R): R {
  const { store } = useProjectSession();
  return useLoroValue(store, select as (state: ReturnType<ProjectStore["getState"]>) => R);
}

/** Undo units are named per finding, `report` or `project`, so each page undoes its own edits. */
export const unitOf = (scope: string, field: string) => `${scope}:${field}`;

/** Writes to the project's state as one undoable step of `unit`. */
export function updateProject(
  session: ProjectSession,
  unit: string,
  write: (draft: ProjectDraft) => void,
) {
  session.store.setState(write, { origin: originOf(unit) });
}
