import { findingContentOf, liveFindings, projectContent } from "@burokrat/domain";
import { reportInput } from "@burokrat/typst/browser";
import type { LoroDoc } from "loro-crdt";
import { useMemo } from "react";
import { useProjectSession } from "../project-session.ts";
import { attempt, useDocValue } from "./sources.ts";
import { TypstPreview } from "./TypstPreview.tsx";

const readAll = (doc: LoroDoc) => doc.toJSON() as unknown;

export function ReportPreview({ doc }: { doc: LoroDoc }) {
  const { projectId } = useProjectSession();
  const json = useDocValue(doc, readAll);
  const shaped = useMemo(
    () =>
      attempt(() => {
        const { project, findings, report } = projectContent(json);
        return reportInput(project, liveFindings(findings).map(findingContentOf), report);
      }),
    [json],
  );
  return <TypstPreview projectId={projectId} kind="report" {...shaped} />;
}
