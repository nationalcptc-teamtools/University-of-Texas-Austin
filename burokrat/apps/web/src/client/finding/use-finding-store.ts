import type { FindingDraft, FindingState } from "@burokrat/domain";
import { useCallback } from "react";
import { unitOf, updateProject, useProjectSession, useProjectState } from "../project-session.ts";
import { STRUCT } from "../undo-registry.ts";

export type UpdateFinding = (update: (finding: FindingDraft) => void) => void;

/** A finding's state, or `undefined` if there is no such finding. */
export function useFinding(findingId: string): FindingState | undefined {
  return useProjectState(useCallback((state) => state.findings[findingId], [findingId]));
}

/** Writes to the finding's form fields, each write one undoable step of the finding's form. */
export function useUpdateFinding(findingId: string) {
  const session = useProjectSession();
  const unit = unitOf(findingId, STRUCT);
  session.undo.get(unit);
  return useCallback<UpdateFinding>(
    (write) => updateProject(session, unit, (draft) => write(draft.findings[findingId]!)),
    [session, unit, findingId],
  );
}
