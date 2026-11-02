import { z } from "zod";
import { CVSS_METRIC_KEYS, CVSS_METRICS, type CvssMetrics } from "./cvss.ts";
import { overallRisk } from "./risk.ts";

export const SCHEMA_VERSION = 2;

const level = z.literal([0, 1, 2, 3, 4]);
const short = z.string().max(500);
const prose = z.string().max(100_000);

const cvssSchema = z.strictObject(
  Object.fromEntries(
    CVSS_METRIC_KEYS.map((key) => [key, z.enum(Object.keys(CVSS_METRICS[key].values)).optional()]),
  ),
) as unknown as z.ZodType<CvssMetrics>;

/** A name `#image("...")` can use without escaping. */
export const IMAGE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;
/**
 * An image file's SHA-256 in hex: its id in docs, on the server and under `/assets/` in the Typst
 * workspace.
 */
export const ASSET_ID = /^[0-9a-f]{64}$/;
/** A finding's id within its project. */
export const FINDING_ID = /^[\w-]{21}$/;

export const MAX_FINDINGS = 500;
export const MAX_ASSETS = 1000;

const assetId = z.string().regex(ASSET_ID);
const optionalAssetId = assetId.or(z.literal(""));
const imageSchema = z.strictObject({ assetId, name: short, caption: short });
const images = z.array(imageSchema).max(100);

/** A finding doc's JSON, without `schemaVersion`. */
export const findingContentSchema = z.strictObject({
  title: short,
  impact: level,
  likelihood: level,
  cvss: cvssSchema,
  mitre: z
    .record(z.string().regex(/^T\d{4}(?:\.\d{3})?$/), z.literal(true))
    .refine((mitre) => Object.keys(mitre).length <= 200, "Too many MITRE techniques"),
  scope: z
    .array(
      z.strictObject({
        ip: short,
        name: short,
        services: z.array(z.strictObject({ name: short, port: short })).max(100),
      }),
    )
    .max(200),
  references: z.array(z.strictObject({ name: short, url: z.string().max(2000) })).max(100),
  images,
  description: prose,
  businessImpact: prose,
  exploitDetails: prose,
  remediation: prose,
});

export type FindingContent = z.infer<typeof findingContentSchema>;

/** A finding's text fields written in Typst markup, in the order they are shown. */
export const FINDING_PROSE = [
  { key: "description", label: "Description" },
  { key: "businessImpact", label: "Business impact" },
  { key: "exploitDetails", label: "Exploitation details" },
  { key: "remediation", label: "Remediation" },
] as const satisfies readonly { key: keyof FindingContent; label: string }[];

export type FindingProse = (typeof FINDING_PROSE)[number]["key"];

/** A title as shown: runs of whitespace, newlines included, become one space. */
export const oneLine = (title: string) => title.replace(/\s+/g, " ").trim();

/** Highest risk first, then impact, then likelihood, then title. */
export function compareFindings(a: FindingContent, b: FindingContent) {
  return (
    overallRisk(b.impact, b.likelihood) - overallRisk(a.impact, a.likelihood) ||
    b.impact - a.impact ||
    b.likelihood - a.likelihood ||
    a.title.localeCompare(b.title)
  );
}

/** A report doc's JSON, without `schemaVersion`. */
export const reportContentSchema = z.strictObject({
  cover: z.strictObject({
    mode: z.enum(["simple", "image"]),
    title: short,
    subtitle: short,
    date: short,
    logoAssetId: optionalAssetId,
    imageAssetId: optionalAssetId,
  }),
  prologue: prose,
  epilogue: prose,
  images,
});

export type ReportContent = z.infer<typeof reportContentSchema>;

const schemaVersion = z.literal(SCHEMA_VERSION);
const person = z.string().max(100);
const timestamp = z.number().int().nonnegative();

/** The project's details the report shows. */
export const projectInfoSchema = z.strictObject({
  name: z.string().max(100),
  companyName: z.string().max(100),
  teamName: z.string().max(100),
});

export type ProjectInfo = z.infer<typeof projectInfoSchema>;

/** A finding's content and its place in the project. A deleted finding is kept, to restore. */
export const findingEntrySchema = findingContentSchema.extend({
  owner: person,
  createdBy: person,
  createdAt: timestamp,
  deleted: z.boolean(),
});

export type FindingEntry = z.infer<typeof findingEntrySchema>;

/** An image file added to the project, by its {@link ASSET_ID}. */
export const assetEntrySchema = z.strictObject({
  name: z.string().max(200),
  createdBy: person,
  createdAt: timestamp,
});

export type AssetEntry = z.infer<typeof assetEntrySchema>;

const limited = (max: number, what: string) => (record: object) =>
  Object.keys(record).length <= max || `Too many ${what}`;

/** `doc.toJSON()` of a project doc. Unknown keys are rejected, at the root too. */
export const projectDocSchema = z.strictObject({
  project: projectInfoSchema.extend({ schemaVersion }),
  findings: z
    .record(z.string().regex(FINDING_ID), findingEntrySchema)
    .refine(limited(MAX_FINDINGS, "findings"))
    .default({}),
  assets: z
    .record(z.string().regex(ASSET_ID), assetEntrySchema)
    .refine(limited(MAX_ASSETS, "images"))
    .default({}),
  report: reportContentSchema,
});

/** Everything a project's report is made of. */
export type ProjectContent = {
  project: ProjectInfo;
  findings: Record<string, FindingEntry>;
  assets: Record<string, AssetEntry>;
  report: ReportContent;
};

/** A project doc's content, from its `doc.toJSON()`. */
export function projectContent(json: unknown): ProjectContent {
  const {
    project: { schemaVersion: _, ...project },
    ...rest
  } = projectDocSchema.parse(json);
  return { project, ...rest };
}

/** A finding's content, without its place in the project. */
export function findingContentOf(entry: FindingEntry): FindingContent {
  const { owner: _o, createdBy: _b, createdAt: _a, deleted: _d, ...content } = entry;
  return content;
}

/** The findings not deleted, oldest first, with their ids. */
export function liveFindings<T extends { createdAt: number; deleted: boolean }>(
  findings: Record<string, T>,
): (T & { id: string })[] {
  return Object.entries(findings)
    .filter(([, finding]) => !finding.deleted)
    .map(([id, finding]) => ({ ...finding, id }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
