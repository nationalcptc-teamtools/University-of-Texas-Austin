import { LoroDoc, LoroMap, type LoroMovableList, type Value } from "loro-crdt";
import {
  FINDING_PROSE,
  SCHEMA_VERSION,
  type AssetEntry,
  type CredentialEntry,
  type EngageContent,
  type FindingContent,
  type FindingEntry,
  type MachineEntry,
  type ProjectContent,
  type ReportContent,
} from "./content.ts";

const FINDING_TEXT_FIELDS = ["title", ...FINDING_PROSE.map(({ key }) => key)] as const;

/** How long a presence key lives unless its owner sets it again. */
export const PRESENCE_TIMEOUT_MS = 30_000;

function setText(map: LoroMap, key: string, value: string) {
  const text = map.ensureMergeableText(key);
  if (value) text.insert(0, value);
}

function setFields(map: LoroMap, fields: Record<string, Value>) {
  for (const [key, value] of Object.entries(fields)) map.set(key, value);
}

function pushMaps<T>(list: LoroMovableList, items: T[], write: (map: LoroMap, item: T) => void) {
  for (const item of items) write(list.pushContainer(new LoroMap()), item);
}

function writeImages(map: LoroMap, images: FindingContent["images"]) {
  pushMaps(map.ensureMergeableMovableList("images"), images, setFields);
}

/**
 * Writes a new finding under `id`. Every container under a map is created mergeable, as the
 * client's `ensureMergeable*` calls throw on a regular container.
 */
export function writeFinding(findings: LoroMap, id: string, entry: FindingEntry) {
  const { impact, likelihood, owner, createdBy, createdAt, deleted } = entry;
  const { cvss, mitre, scope, references, images, targets } = entry;
  const finding = findings.ensureMergeableMap(id);
  setFields(finding, { impact, likelihood, owner, createdBy, createdAt, deleted });
  for (const key of FINDING_TEXT_FIELDS) setText(finding, key, entry[key]);
  setFields(finding.ensureMergeableMap("cvss"), cvss);
  setFields(finding.ensureMergeableMap("mitre"), mitre);
  pushMaps(finding.ensureMergeableMovableList("scope"), scope, (map, { services, ...host }) => {
    setFields(map, host);
    pushMaps(map.ensureMergeableMovableList("services"), services, setFields);
  });
  pushMaps(finding.ensureMergeableMovableList("references"), references, setFields);
  writeImages(finding, images);
  const targetMap = finding.ensureMergeableMap("targets");
  for (const [machineId, ports] of Object.entries(targets))
    setFields(targetMap.ensureMergeableMap(machineId), ports);
}

/** Writes a new machine under `id`, its containers mergeable as {@link writeFinding}'s are. */
export function writeMachine(machines: LoroMap, id: string, entry: MachineEntry) {
  const { services, notes, ...fields } = entry;
  const machine = machines.ensureMergeableMap(id);
  setFields(machine, fields);
  setText(machine, "notes", notes);
  const serviceMap = machine.ensureMergeableMap("services");
  for (const [key, service] of Object.entries(services))
    setFields(serviceMap.ensureMergeableMap(key), service);
}

/** Writes a new file entry under its SHA-256. */
export function writeAsset(assets: LoroMap, id: string, { machines, ...fields }: AssetEntry) {
  const asset = assets.ensureMergeableMap(id);
  setFields(asset, fields);
  setFields(asset.ensureMergeableMap("machines"), machines);
}

/** Writes a new credential under `id`. */
export function writeCredential(
  credentials: LoroMap,
  id: string,
  { works, ...fields }: CredentialEntry,
) {
  const credential = credentials.ensureMergeableMap(id);
  setFields(credential, fields);
  setFields(credential.ensureMergeableMap("works"), works);
}

function writeEngage(engage: LoroMap, content: EngageContent) {
  setText(engage, "outOfScope", content.outOfScope);
  setText(engage, "notes", content.notes);
}

function writeReport(report: LoroMap, content: ReportContent) {
  setFields(report.ensureMergeableMap("cover"), content.cover);
  setText(report, "prologue", content.prologue);
  setText(report, "epilogue", content.epilogue);
  writeImages(report, content.images);
}

/** Builds a new project doc on the server. */
export function createProjectDoc(content: ProjectContent): LoroDoc {
  const { project, findings, machines, assets, credentials, engage, report } = content;
  const doc = new LoroDoc();
  setFields(doc.getMap("project"), { schemaVersion: SCHEMA_VERSION, ...project });
  for (const [id, entry] of Object.entries(findings))
    writeFinding(doc.getMap("findings"), id, entry);
  for (const [id, entry] of Object.entries(machines))
    writeMachine(doc.getMap("machines"), id, entry);
  for (const [id, entry] of Object.entries(assets)) writeAsset(doc.getMap("assets"), id, entry);
  for (const [id, entry] of Object.entries(credentials))
    writeCredential(doc.getMap("credentials"), id, entry);
  writeEngage(doc.getMap("engage"), engage);
  writeReport(doc.getMap("report"), report);
  doc.commit({ origin: "sys:create" });
  return doc;
}
