import { FINDING_PROSE, type FindingProse, type FindingState } from "@burokrat/domain";
import { LayerCard } from "@cloudflare/kumo";
import type { LoroMap } from "loro-crdt";
import { useCallback, type ReactNode } from "react";
import { ImageFields, useImagePaste, type UpdateImages } from "../assets/ImageFields.tsx";
import { MarkupEditor } from "../editors/MarkupEditor.tsx";
import { TextInput } from "../editors/TextInput.tsx";
import { unitOf, useProjectSession } from "../project-session.ts";
import { STRUCT, undoFormEdits } from "../undo-registry.ts";
import { CvssFields } from "./CvssFields.tsx";
import { MitreField } from "./MitreField.tsx";
import { ReferenceFields } from "./ReferenceFields.tsx";
import { RiskFields } from "./RiskFields.tsx";
import { ScopeFields } from "./ScopeFields.tsx";
import { TargetFields } from "./TargetFields.tsx";
import { useUpdateFinding } from "./use-finding-store.ts";

const PLACEHOLDERS: Partial<Record<FindingProse, string>> = {
  exploitDetails: "+ One numbered step per line",
};

type Props = { findingId: string; finding: FindingState; userName: string };

export function FindingEditor({ findingId, finding, userName }: Props) {
  const session = useProjectSession();
  const update = useUpdateFinding(findingId);
  const root = session.doc.getMap("findings").get(findingId) as LoroMap;
  const getTitle = useCallback(() => root.ensureMergeableText("title"), [root]);
  const updateImages: UpdateImages = (write) => update((draft) => write(draft.images));
  const pasteImage = useImagePaste(updateImages, userName);

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={undoFormEdits(session.undo, unitOf(findingId, STRUCT))}
    >
      <Section title="Summary">
        <div data-anchor="title">
          <TextInput
            session={session}
            unit={unitOf(findingId, "title")}
            getText={getTitle}
            label="Title"
            placeholder="Untitled finding"
            maxLength={500}
          />
        </div>
        <div data-anchor="rating">
          <RiskFields finding={finding} update={update} />
        </div>
      </Section>
      <Section title="CVSS 4.0" anchor="rating">
        <CvssFields finding={finding} update={update} />
      </Section>
      <Section title="Scope" anchor="scope">
        <TargetFields finding={finding} update={update} />
        <ScopeFields finding={finding} update={update} />
      </Section>
      <Section title="Images">
        <ImageFields images={finding.images} update={updateImages} userName={userName} />
      </Section>
      <Section title="Write-up">
        {FINDING_PROSE.map(({ key, label }) => (
          <div key={key} data-anchor={key}>
            <MarkupEditor
              session={session}
              unit={unitOf(findingId, key)}
              getText={() => root.ensureMergeableText(key)}
              userName={userName}
              label={label}
              placeholder={PLACEHOLDERS[key]}
              onPasteImage={pasteImage}
            />
          </div>
        ))}
      </Section>
      <Section title="References">
        <div data-anchor="mitre">
          <MitreField finding={finding} update={update} />
        </div>
        <div data-anchor="references" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-kumo-default">Links</span>
          <ReferenceFields finding={finding} update={update} />
        </div>
      </Section>
    </div>
  );
}

type SectionProps = { title: string; anchor?: string; children: ReactNode };

function Section({ title, anchor, children }: SectionProps) {
  return (
    <LayerCard data-anchor={anchor} render={<section aria-label={title} />}>
      <LayerCard.Secondary>
        <h2>{title}</h2>
      </LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-5 px-5 py-4">{children}</LayerCard.Primary>
    </LayerCard>
  );
}
