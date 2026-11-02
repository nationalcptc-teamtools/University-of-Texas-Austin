import { LoroDoc, type LoroMap } from "loro-crdt";
import { Mirror } from "loro-mirror";
import { expect, it } from "vite-plus/test";
import {
  findingContentOf,
  liveFindings,
  projectContent,
  projectDocSchema,
  type MachineEntry,
  type ProjectContent,
} from "./content.ts";
import { createProjectDoc, writeFinding } from "./docs.ts";
import { projectMirrorSchema } from "./mirror.ts";
import { FINDING_TEMPLATES } from "./finding-templates.ts";
import { REPORT_TEMPLATE } from "./templates.ts";

const PNG = "a".repeat(64);
const DC = "mmmmmmmmmmmmmmmmmmmm1";
const meta = { owner: "Alice", createdBy: "Alice", createdAt: 1_000, deleted: false };
const finding = {
  ...FINDING_TEMPLATES.find((template) => template.title === "MS17-010 (EternalBlue)")!,
  images: [{ assetId: PNG, name: "shot.png", caption: "Proof" }],
  targets: { [DC]: { "445/tcp": true as const } },
  ...meta,
};
const machine: MachineEntry = {
  ip: "10.0.0.23",
  hostname: "dc01",
  os: "Windows Server 2019",
  status: "foothold",
  scope: "in",
  scopeNote: "",
  claimedAt: 0,
  services: {
    "445/tcp": { name: "smb", product: "Microsoft Windows SMB", note: "" },
    "88/tcp": { name: "kerberos", product: "", note: "" },
  },
  notes: "Signing not required",
  ...meta,
};
const content: ProjectContent = {
  project: { name: "Engagement", companyName: "Acme", teamName: "Blue" },
  findings: { aaaaaaaaaaaaaaaaaaaa1: finding },
  machines: { [DC]: machine },
  assets: {
    [PNG]: {
      name: "shot.png",
      type: "image/png",
      size: 10,
      machines: { [DC]: true },
      createdBy: "Alice",
      createdAt: 900,
    },
  },
  credentials: {},
  engage: { outOfScope: "", notes: "" },
  report: REPORT_TEMPLATE,
};

const copyOf = (doc: LoroDoc) => LoroDoc.fromSnapshot(doc.export({ mode: "snapshot" }));

function exchange(a: LoroDoc, b: LoroDoc) {
  a.import(b.export({ mode: "update", from: a.oplogVersion() }));
  b.import(a.export({ mode: "update", from: b.oplogVersion() }));
}

it("round-trips project content through a doc", () => {
  expect(projectContent(createProjectDoc(content).toJSON())).toEqual(content);
});

it("reads a project with no findings or images", () => {
  const empty = { ...content, findings: {}, machines: {}, assets: {} };
  expect(projectContent(createProjectDoc(empty).toJSON())).toEqual(empty);
});

it("rejects docs with unknown keys", () => {
  const doc = createProjectDoc(content);
  (doc.getMap("findings").get("aaaaaaaaaaaaaaaaaaaa1") as LoroMap).set("extra", 1);
  expect(projectDocSchema.safeParse(doc.toJSON()).success).toBe(false);
  const other = createProjectDoc(content);
  other.getMap("other").set("x", 1);
  expect(projectDocSchema.safeParse(other.toJSON()).success).toBe(false);
});

it("creates containers a client can reach with ensureMergeable*", () => {
  const doc = createProjectDoc(content);
  const root = doc.getMap("findings").get("aaaaaaaaaaaaaaaaaaaa1") as LoroMap;
  expect(root.ensureMergeableText("description").toString()).toBe(finding.description);
  const scope = root.ensureMergeableMovableList("scope").get(0) as LoroMap;
  expect(scope.ensureMergeableMovableList("services").length).toBe(2);
  const report = doc.getMap("report");
  expect(report.ensureMergeableText("prologue").toString()).toBe(REPORT_TEMPLATE.prologue);
});

it("merges findings added offline on two devices, and edits to one finding", () => {
  const server = createProjectDoc(content);
  const alice = copyOf(server);
  const bob = copyOf(server);
  writeFinding(alice.getMap("findings"), "aaaaaaaaaaaaaaaaaaaa2", { ...finding, createdAt: 2_000 });
  alice.commit();
  writeFinding(bob.getMap("findings"), "bbbbbbbbbbbbbbbbbbbb3", { ...finding, createdAt: 3_000 });
  bob.commit();
  const aliceMirror = new Mirror({ doc: alice, schema: projectMirrorSchema });
  const bobMirror = new Mirror({ doc: bob, schema: projectMirrorSchema });
  aliceMirror.setState((state) => {
    state.findings["aaaaaaaaaaaaaaaaaaaa1"]!.references.push({ name: "A", url: "https://a" });
  });
  bobMirror.setState((state) => {
    state.findings["aaaaaaaaaaaaaaaaaaaa1"]!.cvss.AT = "N";
    state.findings["aaaaaaaaaaaaaaaaaaaa1"]!.deleted = true;
  });

  exchange(alice, bob);

  expect(aliceMirror.getState().findings["bbbbbbbbbbbbbbbbbbbb3"]?.title).toBe(finding.title);
  const merged = projectContent(alice.toJSON());
  expect(liveFindings(merged.findings).map(({ id }) => id)).toEqual([
    "aaaaaaaaaaaaaaaaaaaa2",
    "bbbbbbbbbbbbbbbbbbbb3",
  ]);
  const first = merged.findings["aaaaaaaaaaaaaaaaaaaa1"]!;
  expect(first.references.map((r) => r.name)).toEqual([finding.references[0]!.name, "A"]);
  expect(first.cvss.AT).toBe("N");
  expect(findingContentOf(first, merged.machines).title).toBe(finding.title);
  expect(bob.toJSON()).toEqual(alice.toJSON());
});

it("writes a finding's targets as scope rows of the machine as it is now", () => {
  const renamed = { ...machine, hostname: "dc02", services: { ...machine.services } };
  const { scope } = findingContentOf(finding, { [DC]: renamed });
  expect(scope[0]).toEqual({
    ip: "10.0.0.23",
    name: "dc02",
    services: [{ name: "smb", port: "TCP/445" }],
  });
  expect(scope.slice(1)).toEqual(finding.scope);
  expect(findingContentOf(finding, { [DC]: { ...machine, deleted: true } }).scope).toEqual(
    finding.scope,
  );
});

it("merges services two devices add to one machine, by port", () => {
  const server = createProjectDoc(content);
  const [alice, bob] = [copyOf(server), copyOf(server)];
  for (const [doc, name] of [
    [alice, "SMB"],
    [bob, "microsoft-ds"],
  ] as const) {
    const mirror = new Mirror({ doc, schema: projectMirrorSchema });
    mirror.setState((state) => {
      state.machines[DC]!.services["139/tcp"] = { name, product: "", note: "" };
    });
  }
  exchange(alice, bob);
  const merged = projectContent(alice.toJSON()).machines[DC]!;
  expect(Object.keys(merged.services).sort()).toEqual(["139/tcp", "445/tcp", "88/tcp"]);
});

it("reads machines saved before scope notes and claims", () => {
  const doc = createProjectDoc(content);
  const saved = doc.getMap("machines").get(DC) as LoroMap;
  saved.delete("scopeNote");
  saved.delete("claimedAt");
  expect(projectContent(doc.toJSON())).toEqual(content);
});
