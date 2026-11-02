import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BLANK_FINDING, REPORT_TEMPLATE, type FindingContent } from "@burokrat/domain";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import { afterAll, expect, it } from "vite-plus/test";
import { compileOnce, createCompiler } from "./compile.ts";
import { reportInput } from "./data.ts";
import { exportReport } from "./export.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const ASSET = "a".repeat(64);

const dir = mkdtempSync(join(tmpdir(), "burokrat-export-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const finding = (overrides: Partial<FindingContent>): FindingContent => ({
  ...BLANK_FINDING,
  ...overrides,
});

const input = reportInput(
  { companyName: 'Acme "Shipping" \\ Co', teamName: "Team-07" },
  [
    finding({
      title: "Fenced",
      impact: 3,
      likelihood: 4,
      images: [{ assetId: ASSET, name: "none", caption: "Pixel" }],
      description: 'Shown: #image("none", width: 10%)\r\n\n````\na ``` run\n````',
    }),
    finding({ title: "No images", description: "Plain *text*." }),
  ],
  {
    ...REPORT_TEMPLATE,
    prologue: `${REPORT_TEMPLATE.prologue}\n\nA stray [ and an open /* comment`,
  },
  {},
);

it("exports a report that compiles from disk to the app's PDF", () => {
  const files = exportReport(input, { [ASSET]: { bytes: PNG, extension: "png" } });
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  const compiler = NodeCompiler.create({
    workspace: dir,
    fontArgs: [{ fontPaths: [join(dir, "fonts")] }],
  });
  const result = compiler.compile({ mainFilePath: join(dir, "main.typ") });
  const error = result.takeError();
  if (error || !result.result)
    throw new Error(JSON.stringify(error && compiler.fetchDiagnostics(error)));
  const exported = compiler.pdf(result.result, { creationTimestamp: 0 });

  const app = compileOnce(createCompiler(), {
    kind: "report",
    data: input.data,
    assets: { [ASSET]: PNG },
    creationTimestamp: 0,
  });
  if (!app.ok) throw new Error(JSON.stringify(app.diagnostics));
  expect(Buffer.from(exported).equals(Buffer.from(app.pdf))).toBe(true);
});

it("refuses a report whose images have not reached the server", () => {
  expect(() => exportReport(input, {})).toThrow("1 image(s) in the report have not reached");
});
