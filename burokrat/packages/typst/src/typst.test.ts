import {
  BLANK_FINDING,
  REPORT_TEMPLATE,
  type FindingContent,
  type MachineEntry,
} from "@burokrat/domain";
import { FINDING_TEMPLATES } from "@burokrat/domain/finding-templates";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { compileOnce, createCompiler } from "./compile.ts";
import { checkTypst, findingInput, reportInput, TypstPool } from "./index.ts";

const project = { companyName: "Acme Shipping", teamName: "Team-07" };
const pool = new TypstPool({ size: 1 });
afterAll(() => pool.close());

const finding = (overrides: Partial<FindingContent>): FindingContent => ({
  ...BLANK_FINDING,
  ...overrides,
});

const machine = (overrides: Partial<MachineEntry>): MachineEntry => ({
  ip: "10.0.0.1",
  hostname: "",
  os: "",
  status: "untouched",
  scope: "in",
  scopeNote: "",
  claimedAt: 0,
  services: {},
  notes: "",
  owner: "",
  createdBy: "",
  createdAt: 0,
  deleted: false,
  ...overrides,
});

const HOSTILE = '#panic("pwned") #read("/data.json") ] #text(red)[ $x$ @ref <label> = heading //';

describe("data", () => {
  it("sorts by risk, impact, likelihood and title", () => {
    const { data } = reportInput(
      project,
      [
        finding({ title: "b", impact: 2, likelihood: 2 }),
        finding({ title: "a", impact: 2, likelihood: 2 }),
        finding({ title: "info", impact: 0, likelihood: 4 }),
        finding({ title: "crit", impact: 4, likelihood: 4 }),
      ],
      REPORT_TEMPLATE,
      {},
    );
    expect(data.findings.map((f) => f.title)).toEqual(["crit", "a", "b", "info"]);
    expect(data.findings.map((f) => f.standalone)).toEqual([false, false, false, false]);
  });

  it("maps every image by name to its asset", () => {
    const { data, assetIds } = findingInput(
      project,
      finding({
        images: [{ assetId: "a1b2", name: "shot", caption: "From the list" }],
        description: '#image("shot", width: 50%)',
      }),
    );
    expect(data.findings[0]!.standalone).toBe(true);
    expect(data.findings[0]!.description).toEqual({
      source: '#image("shot", width: 50%)',
      error: null,
    });
    expect(data.findings[0]!.images).toEqual({
      shot: { asset: "a1b2", caption: "From the list" },
    });
    expect(assetIds).toEqual(["a1b2"]);
  });

  it("keeps only http(s) references and derives their domain", () => {
    const { data } = findingInput(
      project,
      finding({
        references: [
          { name: "ok", url: "https://www.example.com/a" },
          { name: "bad", url: "javascript:alert(1)" },
        ],
      }),
    );
    expect(data.findings[0]!.references).toEqual([
      { name: "ok", url: "https://www.example.com/a", domain: "example.com" },
    ]);
  });
});

describe("hosts", () => {
  const machines = {
    b: machine({
      ip: "10.0.0.10",
      hostname: "web",
      os: "Linux",
      scope: "caution",
      services: {
        "445/tcp": { name: "smb", product: "Samba", note: "" },
        "53/udp": { name: "dns", product: "", note: "" },
        "53/tcp": { name: "dns", product: "bind", note: "" },
      },
    }),
    a: machine({ ip: "10.0.0.2" }),
    out: machine({ ip: "10.0.0.3", scope: "out" }),
    gone: machine({ ip: "10.0.0.4", deleted: true }),
  };

  it("lists the live machines in scope by IP, with their ports in order", () => {
    const { data } = reportInput(project, [], REPORT_TEMPLATE, machines);
    expect(data.hosts).toEqual([
      { ip: "10.0.0.2", hostname: "", os: "", services: [] },
      {
        ip: "10.0.0.10",
        hostname: "web",
        os: "Linux",
        services: [
          { port: "TCP/53", name: "dns", product: "bind" },
          { port: "UDP/53", name: "dns", product: "" },
          { port: "TCP/445", name: "smb", product: "Samba" },
        ],
      },
    ]);
  });

  it("compiles a report that shows the host and service tables", () => {
    const report = { ...REPORT_TEMPLATE, prologue: "#hosts-table\n\n#services-table" };
    const { data } = reportInput(project, [], report, machines);
    const outcome = compileOnce(createCompiler(), {
      kind: "report",
      data,
      assets: {},
      creationTimestamp: 0,
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    expect(outcome.warnings).toEqual([]);
  });

  it("compiles a report with no machines", () => {
    const report = { ...REPORT_TEMPLATE, prologue: "#hosts-table\n\n#services-table" };
    const { data } = reportInput(project, [], report, {});
    const outcome = compileOnce(createCompiler(), {
      kind: "report",
      data,
      assets: {},
      creationTimestamp: 0,
    });
    expect(outcome.ok).toBe(true);
  });
});

describe("compile", () => {
  it("passes the self-check, so the fonts load", async () => {
    await checkTypst(pool);
  });

  it("compiles the full report from every seed template without broken fields", () => {
    const { data } = reportInput(project, FINDING_TEMPLATES, REPORT_TEMPLATE, {});
    const outcome = compileOnce(createCompiler(), {
      kind: "report",
      data,
      assets: {},
      creationTimestamp: 0,
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    expect(outcome.warnings).toEqual([]);
    expect(Buffer.from(outcome.pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("starts each finding in the report on a new page", () => {
    const findings = [
      finding({ title: "crit", impact: 4, likelihood: 4 }),
      finding({ title: "a" }),
      finding({ title: "b" }),
    ];
    const { data } = reportInput(project, findings, REPORT_TEMPLATE, {});
    // Only a finding on its own marks where its title lands.
    for (const f of data.findings) f.standalone = true;
    const compiler = createCompiler();
    compiler.mapShadow("/typst-ws/data.json", Buffer.from(JSON.stringify(data)));
    const [anchors] = compiler.query(
      { mainFilePath: "/typst-ws/typ/report-main.typ" },
      { selector: "<anchors>", field: "value" },
    ) as { name: string; page: number }[][];
    const pages = anchors!.filter(({ name }) => name === "title").map(({ page }) => page);
    expect(new Set(pages).size).toBe(findings.length);
  });

  it("renders plain fields without evaluating them, reproducibly", async () => {
    const { data } = findingInput(
      project,
      finding({ title: HOSTILE, scope: [{ ip: HOSTILE, name: HOSTILE, services: [] }] }),
    );
    const job = {
      kind: "finding" as const,
      data,
      assets: {},
      creationTimestamp: 1_700_000_000,
    };
    const [first, second] = await Promise.all([pool.compile(job), pool.compile(job)]);
    if (!first.ok || !second.ok) throw new Error("compile failed");
    expect(Buffer.compare(first.pdf, second.pdf)).toBe(0);
  });

  it("replaces a worker that exits while idle", async () => {
    const { data } = findingInput(project, BLANK_FINDING);
    const job = { kind: "finding" as const, data, assets: {}, creationTimestamp: 0 };
    await pool.compile(job);
    await pool["slots"][0]!.worker.terminate();
    expect((await pool.compile(job)).ok).toBe(true);
  });

  it("refuses a PDF with a broken text field, naming the field", async () => {
    const { data } = findingInput(
      project,
      finding({ description: "Fine.", remediation: '#panic("broken")' }),
    );
    const outcome = await pool.compile({ kind: "finding", data, assets: {}, creationTimestamp: 0 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.broken).toEqual([{ label: "Remediation", error: 'panicked with: "broken"' }]);
    }
  });

  it("embeds an image asset by id", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const { data, assetIds } = findingInput(
      project,
      finding({
        images: [{ assetId: "a1", name: "x", caption: "Pixel" }],
        description: '#image("x")',
      }),
    );
    const assets = Object.fromEntries(assetIds.map((id) => [id, png]));
    const outcome = await pool.compile({
      kind: "finding",
      data,
      assets,
      creationTimestamp: 0,
    });
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
    expect(outcome.warnings).toEqual([]);
  });

  it("reports a missing asset as a diagnostic", () => {
    const { data } = findingInput(
      project,
      finding({
        images: [{ assetId: "gone", name: "x", caption: "" }],
        description: '#image("x")',
      }),
    );
    const job = { kind: "finding" as const, data, assets: {}, creationTimestamp: 0 };
    const outcome = compileOnce(createCompiler(), job);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.diagnostics[0]!.message).toContain("file not found");
  });
});
