import { LoroDoc } from "loro-crdt";
import { expect, it } from "vite-plus/test";
import {
  projectContent,
  projectDocSchema,
  type MachineEntry,
  type ProjectContent,
} from "./content.ts";
import { createProjectDoc } from "./docs.ts";
import { applyScan, planScan, summarizeScan, type ScannedHost } from "./imports.ts";
import { REPORT_TEMPLATE } from "./templates.ts";

const DC = "mmmmmmmmmmmmmmmmmmmm1";
const GONE = "mmmmmmmmmmmmmmmmmmmm2";
const meta = { owner: "", createdBy: "Alice", createdAt: 1_000, deleted: false };
const machine = (fields: Partial<MachineEntry>): MachineEntry => ({
  ip: "10.0.0.23",
  hostname: "",
  os: "",
  status: "foothold",
  scope: "caution",
  scopeNote: "",
  claimedAt: 0,
  services: {},
  notes: "typed",
  ...meta,
  ...fields,
});
const host = (fields: Partial<ScannedHost>): ScannedHost => ({
  ip: "10.0.0.23",
  hostname: "",
  os: "",
  services: {},
  ...fields,
});

const typed = machine({
  hostname: "dc01",
  services: {
    "445/tcp": { name: "smb", product: "", note: "check signing" },
    "88/tcp": { name: "kerberos", product: "MS Kerberos", note: "" },
  },
});

function projectWith(machines: Record<string, MachineEntry>): LoroDoc {
  const content: ProjectContent = {
    project: { name: "Engagement", companyName: "", teamName: "" },
    findings: {},
    machines,
    assets: {},
    credentials: {},
    engage: { outOfScope: "", notes: "" },
    report: REPORT_TEMPLATE,
  };
  return createProjectDoc(content);
}

function importScan(
  doc: LoroDoc,
  hosts: ScannedHost[],
  ids = ["nnnnnnnnnnnnnnnnnnnn1", "nnnnnnnnnnnnnnnnnnnn2"],
) {
  const machines = projectContent(doc.toJSON()).machines;
  const plan = planScan(machines, hosts);
  applyScan(doc.getMap("machines"), plan, {
    author: "Bob",
    now: 5_000,
    newId: () => ids.shift()!,
    scopeOf: (ip) => (ip === "10.0.0.99" ? "out" : "in"),
  });
  doc.commit();
  return plan;
}

it("adds machines that match no IP and updates the ones that do", () => {
  const plan = planScan({ [DC]: typed }, [
    host({
      ip: "10.0.0.50",
      hostname: "web",
      services: { "80/tcp": { name: "http", product: "" } },
    }),
    host({ os: "Windows Server 2019", services: { "3389/tcp": { name: "rdp", product: "" } } }),
  ]);
  expect(plan.added.map(({ ip }) => ip)).toEqual(["10.0.0.50"]);
  expect(plan.updates).toEqual([
    {
      id: DC,
      ip: "10.0.0.23",
      os: "Windows Server 2019",
      newServices: { "3389/tcp": { name: "rdp", product: "" } },
      filledServices: {},
    },
  ]);
  expect(summarizeScan(plan)).toEqual({ machines: 1, services: 2, updated: 1 });
});

it("fills empty fields and never overwrites typed ones", () => {
  const plan = planScan({ [DC]: typed }, [
    host({
      hostname: "scanned-name",
      os: "Windows",
      services: {
        "445/tcp": { name: "microsoft-ds", product: "Microsoft Windows SMB" },
        "88/tcp": { name: "kerberos-sec", product: "Other" },
      },
    }),
  ]);
  expect(plan.updates).toEqual([
    {
      id: DC,
      ip: "10.0.0.23",
      os: "Windows",
      newServices: {},
      filledServices: { "445/tcp": { product: "Microsoft Windows SMB" } },
    },
  ]);

  const doc = projectWith({ [DC]: typed });
  importScan(doc, [
    host({
      hostname: "scanned-name",
      os: "Windows",
      services: { "445/tcp": { name: "microsoft-ds", product: "Microsoft Windows SMB" } },
    }),
  ]);
  expect(projectContent(doc.toJSON()).machines[DC]).toEqual({
    ...typed,
    os: "Windows",
    services: {
      ...typed.services,
      "445/tcp": { name: "smb", product: "Microsoft Windows SMB", note: "check signing" },
    },
  });
});

it("leaves out an update with nothing to change", () => {
  const plan = planScan({ [DC]: typed }, [
    host({ hostname: "other", services: { "88/tcp": { name: "kerberos-sec", product: "Other" } } }),
  ]);
  expect(plan).toEqual({ added: [], updates: [] });
  expect(summarizeScan(plan)).toEqual({ machines: 0, services: 0, updated: 0 });
});

it("merges duplicate IPs in one scan", () => {
  const plan = planScan({}, [
    host({ hostname: "", os: "Linux", services: { "22/tcp": { name: "ssh", product: "" } } }),
    host({
      hostname: "box",
      os: "Other",
      services: {
        "22/tcp": { name: "ssh", product: "OpenSSH 9.2" },
        "80/tcp": { name: "http", product: "" },
      },
    }),
  ]);
  expect(plan.added).toEqual([
    host({
      hostname: "box",
      os: "Linux",
      services: {
        "22/tcp": { name: "ssh", product: "OpenSSH 9.2" },
        "80/tcp": { name: "http", product: "" },
      },
    }),
  ]);
});

it("does not match deleted machines", () => {
  const plan = planScan({ [GONE]: machine({ deleted: true }) }, [host({})]);
  expect(plan.added).toHaveLength(1);
  expect(plan.updates).toEqual([]);
});

it("writes new machines that parse, and a second import changes nothing", () => {
  const doc = projectWith({ [DC]: typed, [GONE]: machine({ ip: "10.0.0.99", deleted: true }) });
  const hosts = [
    host({ os: "Windows", services: { "3389/tcp": { name: "rdp", product: "" } } }),
    host({
      ip: "10.0.0.50",
      hostname: "web",
      services: { "80/tcp": { name: "http", product: "nginx 1.25" } },
    }),
  ];
  importScan(doc, hosts);

  expect(() => projectDocSchema.parse(doc.toJSON())).not.toThrow();
  const { machines } = projectContent(doc.toJSON());
  expect(Object.keys(machines)).toHaveLength(3);
  expect(machines.nnnnnnnnnnnnnnnnnnnn1).toEqual({
    ip: "10.0.0.50",
    hostname: "web",
    os: "",
    status: "untouched",
    scope: "in",
    scopeNote: "",
    claimedAt: 0,
    services: { "80/tcp": { name: "http", product: "nginx 1.25", note: "" } },
    notes: "",
    owner: "",
    createdBy: "Bob",
    createdAt: 5_000,
    deleted: false,
  });
  expect(machines[DC]!.services["3389/tcp"]).toEqual({ name: "rdp", product: "", note: "" });

  const before = doc.toJSON();
  const again = importScan(doc, hosts);
  expect(again).toEqual({ added: [], updates: [] });
  expect(doc.toJSON()).toEqual(before);
});

it("keeps a service filled by another person after merging", () => {
  const alice = projectWith({ [DC]: typed });
  const bob = new LoroDoc();
  bob.import(alice.export({ mode: "snapshot" }));
  importScan(alice, [host({ services: { "3389/tcp": { name: "rdp", product: "" } } })]);
  importScan(bob, [host({ services: { "3389/tcp": { name: "ms-wbt-server", product: "" } } })]);
  alice.import(bob.export({ mode: "update" }));
  const services = projectContent(alice.toJSON()).machines[DC]!.services;
  expect(Object.keys(services).sort()).toEqual(["3389/tcp", "445/tcp", "88/tcp"]);
});

it("gives each new machine the scope its address has", () => {
  const doc = projectWith({});
  importScan(doc, [host({ ip: "10.0.0.98" }), host({ ip: "10.0.0.99" })]);
  const machines = Object.values(projectContent(doc.toJSON()).machines);
  expect(Object.fromEntries(machines.map(({ ip, scope }) => [ip, scope]))).toEqual({
    "10.0.0.98": "in",
    "10.0.0.99": "out",
  });
});
