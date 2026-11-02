import { schema, type InferInputType, type InferType } from "loro-mirror";
import type { CvssMetrics } from "./cvss.ts";
import type { Level } from "./risk.ts";

const mergeable = { mergeableMapChildContainers: true };
const byCid = (item: { $cid: string }) => item.$cid;

const images = schema.LoroMovableList(
  schema.LoroMap(
    { assetId: schema.String(), name: schema.String(), caption: schema.String() },
    mergeable,
  ),
  byCid,
);

const report = schema.LoroMap(
  {
    cover: schema.LoroMap(
      {
        mode: schema.String<"simple" | "image">(),
        title: schema.String(),
        subtitle: schema.String(),
        date: schema.String(),
        logoAssetId: schema.String(),
        imageAssetId: schema.String(),
      },
      mergeable,
    ),
    prologue: schema.Ignore(),
    epilogue: schema.Ignore(),
    images,
  },
  mergeable,
);

const finding = schema.LoroMap(
  {
    title: schema.LoroText(),
    impact: schema.Number(),
    likelihood: schema.Number(),
    cvss: schema.LoroMapRecord(schema.String()),
    mitre: schema.LoroMapRecord(schema.Boolean()),
    scope: schema.LoroMovableList(
      schema.LoroMap(
        {
          ip: schema.String(),
          name: schema.String(),
          services: schema.LoroMovableList(
            schema.LoroMap({ name: schema.String(), port: schema.String() }, mergeable),
            byCid,
          ),
        },
        mergeable,
      ),
      byCid,
    ),
    references: schema.LoroMovableList(
      schema.LoroMap({ name: schema.String(), url: schema.String() }, mergeable),
      byCid,
    ),
    images,
    description: schema.Ignore(),
    businessImpact: schema.Ignore(),
    exploitDetails: schema.Ignore(),
    remediation: schema.Ignore(),
    owner: schema.String(),
    createdBy: schema.String(),
    createdAt: schema.Number(),
    deleted: schema.Boolean(),
  },
  mergeable,
);

/**
 * Typed state for a project doc. Prose fields are bound to CodeMirror, not the mirror; a finding's
 * title is mirrored for lists, but only ever written through its text.
 */
export const projectMirrorSchema = schema({
  project: schema.LoroMap(
    {
      schemaVersion: schema.Number(),
      name: schema.String(),
      companyName: schema.String(),
      teamName: schema.String(),
    },
    mergeable,
  ),
  findings: schema.LoroMapRecord(finding, mergeable),
  assets: schema.LoroMapRecord(
    schema.LoroMap(
      { name: schema.String(), createdBy: schema.String(), createdAt: schema.Number() },
      mergeable,
    ),
    mergeable,
  ),
  report,
});

type ProjectMirror = InferType<typeof projectMirrorSchema>;
export type ProjectDraft = InferInputType<typeof projectMirrorSchema>;

/** Every value the server accepts is one of these, so the mirror's plain numbers are narrowed. */
export type FindingState = Omit<
  ProjectMirror["findings"][string],
  "impact" | "likelihood" | "cvss"
> & {
  impact: Level;
  likelihood: Level;
  cvss: CvssMetrics;
};
export type FindingDraft = ProjectDraft["findings"][string];

export type ProjectState = Omit<ProjectMirror, "findings"> & {
  findings: Record<string, FindingState>;
};

export type ReportState = ProjectMirror["report"];
export type ReportDraft = ProjectDraft["report"];

/** A finding's or report's images, as written through the mirror. */
export type ImageDrafts = FindingDraft["images"];
