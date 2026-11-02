import { z } from "zod";
import { CVSS_METRIC_KEYS, CVSS_METRICS, type CvssMetrics } from "./cvss.ts";
import { CREDENTIAL_TYPES } from "./credentials.ts";
import { MACHINE_SCOPES, MACHINE_STATUSES, scopeWithTargets } from "./machines.ts";
import { overallRisk } from "./risk.ts";

export const SCHEMA_VERSION = 3;

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
/** A finding's or machine's id within its project. */
export const RECORD_ID = /^[\w-]{21}$/;
/** A service's key within its machine: its port and protocol, such as `445/tcp`. */
export const SERVICE_KEY =
  /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])\/(?:tcp|udp)$/;

export const MAX_FINDINGS = 500;
export const MAX_ASSETS = 1000;
export const MAX_MACHINES = 500;
export const MAX_CREDENTIALS = 1000;
/** Generous for one host, and stops a firewall that answers on every port at a sane size. */
export const MAX_SERVICES = 1000;

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
const recordId = z.string().regex(RECORD_ID);
const serviceKey = z.string().regex(SERVICE_KEY);

const limited = (max: number, what: string) => (record: object) =>
  Object.keys(record).length <= max || `Too many ${what}`;

/** The project's details the report shows. */
export const projectInfoSchema = z.strictObject({
  name: z.string().max(100),
  companyName: z.string().max(100),
  teamName: z.string().max(100),
});

export type ProjectInfo = z.infer<typeof projectInfoSchema>;

/**
 * A finding's content and its place in the project: the machines it affects, by id, each with the
 * services it affects by key. A deleted finding is kept, to restore.
 */
export const findingEntrySchema = findingContentSchema.extend({
  targets: z
    .record(recordId, z.record(serviceKey, z.literal(true)))
    .refine(limited(200, "targets")),
  owner: person,
  createdBy: person,
  createdAt: timestamp,
  deleted: z.boolean(),
});

export type FindingEntry = z.infer<typeof findingEntrySchema>;

/** A file added to the project, by its {@link ASSET_ID}, and the machines it belongs to. */
export const assetEntrySchema = z.strictObject({
  name: z.string().max(200),
  type: z.string().max(200),
  size: z.number().int().nonnegative(),
  machines: z.record(recordId, z.literal(true)).refine(limited(MAX_MACHINES, "machines")),
  createdBy: person,
  createdAt: timestamp,
});

export type AssetEntry = z.infer<typeof assetEntrySchema>;

/** A port found open on a machine, under its {@link SERVICE_KEY}. */
export const serviceEntrySchema = z.strictObject({ name: short, product: short, note: short });

export type ServiceEntry = z.infer<typeof serviceEntrySchema>;

/** A machine in the engagement. A deleted machine is kept, to restore. */
export const machineEntrySchema = z.strictObject({
  ip: short,
  hostname: short,
  os: short,
  status: z.enum(MACHINE_STATUSES),
  scope: z.enum(MACHINE_SCOPES),
  scopeNote: short.default(""),
  services: z.record(serviceKey, serviceEntrySchema).refine(limited(MAX_SERVICES, "services")),
  notes: prose,
  owner: person,
  claimedAt: timestamp.default(0),
  createdBy: person,
  createdAt: timestamp,
  deleted: z.boolean(),
});

export type MachineEntry = z.infer<typeof machineEntrySchema>;

/** A login the team found, where it came from, and the machines it works on. */
export const credentialEntrySchema = z.strictObject({
  username: short,
  domain: short,
  secret: z.string().max(10_000),
  type: z.enum(CREDENTIAL_TYPES),
  source: recordId.or(z.literal("")),
  works: z.record(recordId, z.literal(true)).refine(limited(MAX_MACHINES, "machines")),
  note: short,
  createdBy: person,
  createdAt: timestamp,
  deleted: z.boolean(),
});

export type CredentialEntry = z.infer<typeof credentialEntrySchema>;

/** The team's shared text for the engagement: excluded addresses, and notes on everything. */
export const engageContentSchema = z.strictObject({
  outOfScope: z.string().max(10_000),
  notes: prose,
});

export type EngageContent = z.infer<typeof engageContentSchema>;

export const BLANK_ENGAGE: EngageContent = { outOfScope: "", notes: "" };

/** `doc.toJSON()` of a project doc. Unknown keys are rejected, at the root too. */
export const projectDocSchema = z.strictObject({
  project: projectInfoSchema.extend({ schemaVersion }),
  findings: z
    .record(recordId, findingEntrySchema)
    .refine(limited(MAX_FINDINGS, "findings"))
    .default({}),
  machines: z
    .record(recordId, machineEntrySchema)
    .refine(limited(MAX_MACHINES, "machines"))
    .default({}),
  assets: z
    .record(z.string().regex(ASSET_ID), assetEntrySchema)
    .refine(limited(MAX_ASSETS, "files"))
    .default({}),
  credentials: z
    .record(recordId, credentialEntrySchema)
    .refine(limited(MAX_CREDENTIALS, "credentials"))
    .default({}),
  engage: engageContentSchema.default(BLANK_ENGAGE),
  report: reportContentSchema,
});

/** Everything a project's report is made of. */
export type ProjectContent = {
  project: ProjectInfo;
  findings: Record<string, FindingEntry>;
  machines: Record<string, MachineEntry>;
  assets: Record<string, AssetEntry>;
  credentials: Record<string, CredentialEntry>;
  engage: EngageContent;
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

/**
 * A finding's content, without its place in the project. The machines it targets become scope
 * rows of their current IP, hostname and services, ahead of the rows typed in.
 */
export function findingContentOf(
  entry: FindingEntry,
  machines: Record<string, MachineEntry>,
): FindingContent {
  const { targets, owner: _o, createdBy: _b, createdAt: _a, deleted: _d, ...content } = entry;
  return { ...content, scope: [...scopeWithTargets(targets, machines), ...content.scope] };
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
