import { findingContentOf, findingEntrySchema, projectDocSchema } from "@burokrat/domain";
import { findingInput } from "@burokrat/typst/browser";
import { isContainer, type LoroDoc } from "loro-crdt";
import { useCallback, useMemo } from "react";
import { useProjectSession } from "../project-session.ts";
import { attempt, useDocValue } from "./sources.ts";
import { TypstPreview } from "./TypstPreview.tsx";

export function FindingPreview({ doc, findingId }: { doc: LoroDoc; findingId: string }) {
  const { projectId } = useProjectSession();
  const read = useCallback(
    (shown: LoroDoc) => {
      const finding = shown.getMap("findings").get(findingId);
      return {
        project: shown.getMap("project").toJSON() as unknown,
        finding: isContainer(finding) ? (finding.toJSON() as unknown) : finding,
      };
    },
    [findingId],
  );
  const { project, finding } = useDocValue(doc, read);
  const shaped = useMemo(
    () =>
      attempt(() =>
        findingInput(
          projectDocSchema.shape.project.parse(project),
          findingContentOf(findingEntrySchema.parse(finding)),
        ),
      ),
    [project, finding],
  );
  return <TypstPreview projectId={projectId} kind="finding" {...shaped} />;
}
