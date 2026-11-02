import type { ProjectState, ReportDraft } from "@burokrat/domain";
import { useCallback } from "react";
import { unitOf, updateProject, useProjectSession, useProjectState } from "../project-session.ts";
import { STRUCT } from "../undo-registry.ts";

export type UpdateReport = (update: (report: ReportDraft) => void) => void;

export const REPORT_UNIT = unitOf("report", STRUCT);

const selectReport = (state: ProjectState) => state.report;

/** The report's form fields, and a writer making each write one undoable step. */
export function useReportStore() {
  const session = useProjectSession();
  session.undo.get(REPORT_UNIT);
  const update: UpdateReport = useCallback(
    (write) => updateProject(session, REPORT_UNIT, (draft) => write(draft.report)),
    [session],
  );
  return { report: useProjectState(selectReport), update };
}
