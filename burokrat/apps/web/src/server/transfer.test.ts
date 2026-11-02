import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BLANK_FINDING, REPORT_TEMPLATE, type Level, type ProjectContent } from "@burokrat/domain";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vite-plus/test";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "burokrat-transfer-"));

const { migrateDatabase } = await import("./db.server.ts");
const { readBlob, sha256Of, storeBlob } = await import("./assets.server.ts");
const { createProject, listProjects, readProject } = await import("./projects.server.ts");
const { exportProject, importProject, unzipLimited } = await import("./transfer.server.ts");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const LOGO = sha256Of(PNG);
const MISSING = "f".repeat(64);
const meta = { createdBy: "Alice", createdAt: 1, deleted: false };

let zip: Uint8Array;
let original: ProjectContent;

beforeAll(() => {
  migrateDatabase();
  storeBlob(LOGO, PNG);
  const project = createProject({
    project: { name: "Acme", companyName: "Acme Corp", teamName: "Blue" },
    findings: {
      aaaaaaaaaaaaaaaaaaaa1: { ...BLANK_FINDING, title: "First", owner: "Alice", ...meta },
      aaaaaaaaaaaaaaaaaaaa2: {
        ...BLANK_FINDING,
        title: "Second",
        images: [{ assetId: LOGO, name: "shot", caption: "" }],
        owner: "Bob",
        ...meta,
        deleted: true,
      },
    },
    assets: {
      [LOGO]: { name: "logo.png", createdBy: "Alice", createdAt: 1 },
      [MISSING]: { name: "never-uploaded.png", createdBy: "Bob", createdAt: 2 },
    },
    report: { ...REPORT_TEMPLATE, cover: { ...REPORT_TEMPLATE.cover, logoAssetId: LOGO } },
  });
  original = readProject(project.id)!;
  zip = exportProject(original);
});

function rezip(edit: (manifest: Record<string, unknown>) => void) {
  const files = unzipSync(zip);
  const manifest = JSON.parse(strFromU8(files["project.json"]!));
  edit(manifest);
  return zipSync({ ...files, "project.json": strToU8(JSON.stringify(manifest)) });
}

describe("project transfer", () => {
  it("round-trips the content and the uploaded images into a new project", () => {
    const project = importProject(zip);
    expect(project.name).toBe("Acme");
    expect(readProject(project.id)).toEqual(original);
    expect(Object.keys(unzipSync(zip)).toSorted()).toEqual(["blobs/" + LOGO, "project.json"]);
    expect(readBlob(LOGO)?.equals(PNG)).toBe(true);
  });

  it("rejects a manifest that fails the schema, writing nothing", () => {
    const before = listProjects().length;
    const bad = rezip((manifest) => {
      const { findings } = manifest.content as ProjectContent;
      findings["aaaaaaaaaaaaaaaaaaaa1"]!.impact = 9 as Level;
    });
    expect(() => importProject(bad)).toThrow("project.json is not valid");
    expect(listProjects()).toHaveLength(before);
  });

  it("rejects a blob that does not match its hash", () => {
    const files = unzipSync(zip);
    const name = Object.keys(files).find((file) => file.startsWith("blobs/"))!;
    const tampered = zipSync({ ...files, [name]: new Uint8Array([...PNG, 0]) });
    expect(() => importProject(tampered)).toThrow("does not match its hash");
  });

  it("counts what entries actually inflate to, not the sizes they declare", () => {
    const bomb = zipSync({ "blobs/bomb": new Uint8Array(4 * 1024 * 1024) });
    const header = new DataView(bomb.buffer, bomb.byteOffset);
    header.setUint32(22, 100, true);
    expect(() => unzipLimited(bomb, () => true, 1024 * 1024)).toThrow("The archive is too large.");
    expect(unzipLimited(bomb, () => false, 1024 * 1024)).toEqual({});
  });
});
