import { useCallback } from "react";
import { MarkupEditor } from "../editors/MarkupEditor.tsx";
import { unitOf, useProjectSession } from "../project-session.ts";

type Props = {
  field: "notes" | "outOfScope";
  userName: string;
  label: string;
  placeholder: string;
};

/** One of the team's shared texts for the engagement, edited together as plain text. */
export function EngageText({ field, userName, label, placeholder }: Props) {
  const session = useProjectSession();
  const getText = useCallback(
    () => session.doc.getMap("engage").ensureMergeableText(field),
    [session, field],
  );
  return (
    <MarkupEditor
      session={session}
      unit={unitOf("engage", field)}
      getText={getText}
      userName={userName}
      label={label}
      placeholder={placeholder}
      plain
    />
  );
}
