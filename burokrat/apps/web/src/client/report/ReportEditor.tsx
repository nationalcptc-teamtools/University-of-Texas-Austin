import { Button, Radio, Text } from "@cloudflare/kumo";
import { TrashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AssetPicker } from "../assets/AssetPicker.tsx";
import { ImageFields, useImagePaste, type UpdateImages } from "../assets/ImageFields.tsx";
import { assetUrl } from "../collections.ts";
import { MarkupEditor } from "../editors/MarkupEditor.tsx";
import { SyncedInput } from "../editors/SyncedInput.tsx";
import { unitOf, useProjectSession } from "../project-session.ts";
import { undoFormEdits } from "../undo-registry.ts";
import { REPORT_UNIT, useReportStore } from "./use-report-store.ts";

const TEXTS = [
  { key: "prologue", label: "Before the findings" },
  { key: "epilogue", label: "After the findings" },
] as const;

const COVER_TEXTS = [
  { key: "title", label: "Title", placeholder: "Security Assessment Report" },
  { key: "subtitle", label: "Subtitle", placeholder: "Defaults to the team name" },
  { key: "date", label: "Date", placeholder: "November 8th, 2025" },
] as const;

/** The one image each cover style shows. */
const COVER_IMAGES = {
  simple: { label: "Logo", key: "logoAssetId" },
  image: { label: "Background", key: "imageAssetId" },
} as const;

export function ReportEditor({ userName }: { userName: string }) {
  const session = useProjectSession();
  const { report, update } = useReportStore();
  const image = COVER_IMAGES[report.cover.mode];
  const root = session.doc.getMap("report");
  const updateImages: UpdateImages = (write) => update((draft) => write(draft.images));
  const pasteImage = useImagePaste(updateImages, userName);

  return (
    <div className="flex flex-col gap-8" onKeyDown={undoFormEdits(session.undo, REPORT_UNIT)}>
      <Section title="Cover" anchor="cover">
        <Radio.Group
          appearance="segmented"
          legend="Style"
          value={report.cover.mode}
          onValueChange={(mode) => update((draft) => void (draft.cover.mode = mode))}
        >
          <Radio.Item label="Title page" value="simple" />
          <Radio.Item label="Full-page image" value="image" />
        </Radio.Group>
        {report.cover.mode === "simple" &&
          COVER_TEXTS.map(({ key, label, placeholder }) => (
            <SyncedInput
              key={key}
              label={label}
              placeholder={placeholder}
              maxLength={500}
              value={report.cover[key]}
              onChange={(event) => update((draft) => void (draft.cover[key] = event.target.value))}
            />
          ))}
        <CoverImage
          projectId={session.projectId}
          userName={userName}
          label={image.label}
          assetId={report.cover[image.key]}
          onChange={(id) => update((draft) => void (draft.cover[image.key] = id))}
        />
      </Section>
      <Section title="Images">
        <ImageFields images={report.images} update={updateImages} userName={userName} />
      </Section>
      {TEXTS.map(({ key, label }) => (
        <Section key={key} title={label} anchor={key}>
          <MarkupEditor
            session={session}
            unit={unitOf("report", key)}
            getText={() => root.ensureMergeableText(key)}
            userName={userName}
            label="Typst"
            placeholder="= Heading"
            onPasteImage={pasteImage}
          />
        </Section>
      ))}
    </div>
  );
}

type CoverImageProps = {
  projectId: string;
  userName: string;
  label: string;
  assetId: string;
  onChange: (assetId: string) => void;
};

function CoverImage({ projectId, userName, label, assetId, onChange }: CoverImageProps) {
  return (
    <div className="flex flex-col gap-2">
      <Text bold>{label}</Text>
      {assetId && (
        <img
          src={assetUrl(projectId, assetId)}
          alt=""
          className="h-32 w-fit max-w-full rounded-md bg-kumo-tint object-contain"
        />
      )}
      <div className="flex gap-2">
        <AssetPicker
          userName={userName}
          label={assetId ? "Replace" : "Choose"}
          onPick={(asset) => onChange(asset.id)}
        />
        {assetId && (
          <Button variant="secondary" icon={TrashIcon} onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

type SectionProps = { title: string; anchor?: string; children: ReactNode };

function Section({ title, anchor, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3" data-anchor={anchor}>
      <Text variant="heading" as="h2">
        {title}
      </Text>
      {children}
    </section>
  );
}
