import { schema, type InferInputType, type InferType } from "loro-mirror";
import type { CredentialType } from "./credentials.ts";
import type { CvssMetrics } from "./cvss.ts";
import type { MachineScope, MachineStatus } from "./machines.ts";
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
    targets: schema.LoroMapRecord(schema.LoroMapRecord(schema.Boolean()), mergeable),
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

const machine = schema.LoroMap(
  {
    ip: schema.String(),
    hostname: schema.String(),
    os: schema.String(),
    status: schema.String<MachineStatus>(),
    scope: schema.String<MachineScope>(),
    scopeNote: schema.String(),
    services: schema.LoroMapRecord(
      schema.LoroMap(
        { name: schema.String(), product: schema.String(), note: schema.String() },
        mergeable,
      ),
      mergeable,
    ),
    notes: schema.Ignore(),
    owner: schema.String(),
    claimedAt: schema.Number(),
    createdBy: schema.String(),
    createdAt: schema.Number(),
    deleted: schema.Boolean(),
  },
  mergeable,
);

/**
 * Typed state for a project doc. Prose fields and notes are bound to CodeMirror, not the mirror; a finding's
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
  machines: schema.LoroMapRecord(machine, mergeable),
  assets: schema.LoroMapRecord(
    schema.LoroMap(
      {
        name: schema.String(),
        type: schema.String(),
        size: schema.Number(),
        machines: schema.LoroMapRecord(schema.Boolean()),
        createdBy: schema.String(),
        createdAt: schema.Number(),
      },
      mergeable,
    ),
    mergeable,
  ),
  credentials: schema.LoroMapRecord(
    schema.LoroMap(
      {
        username: schema.String(),
        domain: schema.String(),
        secret: schema.String(),
        type: schema.String<CredentialType>(),
        source: schema.String(),
        works: schema.LoroMapRecord(schema.Boolean()),
        note: schema.String(),
        createdBy: schema.String(),
        createdAt: schema.Number(),
        deleted: schema.Boolean(),
      },
      mergeable,
    ),
    mergeable,
  ),
  engage: schema.LoroMap({ outOfScope: schema.Ignore(), notes: schema.Ignore() }, mergeable),
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

export type MachineState = ProjectMirror["machines"][string];
export type MachineDraft = ProjectDraft["machines"][string];
export type AssetState = ProjectMirror["assets"][string];
export type CredentialState = ProjectMirror["credentials"][string];
export type CredentialDraft = ProjectDraft["credentials"][string];

export type ReportState = ProjectMirror["report"];
export type ReportDraft = ProjectDraft["report"];

/** A finding's or report's images, as written through the mirror. */
export type ImageDrafts = FindingDraft["images"];
