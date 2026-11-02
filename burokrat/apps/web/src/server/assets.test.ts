import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPORT_TEMPLATE } from "@burokrat/domain";
import { beforeAll, describe, expect, it } from "vite-plus/test";

const dataDir = mkdtempSync(join(tmpdir(), "burokrat-assets-"));
process.env.DATA_DIR = dataDir;

const { migrateDatabase } = await import("./db.server.ts");
const { assetBytes, collectOrphanedBlobs, MAX_ASSET_BYTES, readBlob, sha256Of, storeBlob } =
  await import("./assets.server.ts");
const { createProject } = await import("./projects.server.ts");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const OTHER_PNG = Buffer.concat([PNG, Buffer.from([0])]);
const LOGO_PNG = Buffer.concat([PNG, Buffer.from([1])]);
const DAY_MS = 24 * 60 * 60 * 1000;

const store = (bytes: Buffer) => {
  const sha256 = sha256Of(bytes);
  storeBlob(sha256, bytes);
  return sha256;
};
const blobs = () => readdirSync(join(dataDir, "blobs")).toSorted();

beforeAll(() => {
  migrateDatabase();
});

describe("storeBlob", () => {
  it("accepts images by their magic bytes and rejects the rest", () => {
    const sha256 = store(PNG);
    expect(readBlob(sha256)?.equals(PNG)).toBe(true);
    const svg = Buffer.from("<svg/>");
    expect(() => storeBlob(sha256Of(svg), svg)).toThrow("Only PNG, JPEG and GIF");
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_ASSET_BYTES)]);
    expect(() => storeBlob(sha256Of(big), big)).toThrow("10 MB");
  });

  it("rejects bytes that do not match the hash they are stored under", () => {
    expect(() => storeBlob(sha256Of(OTHER_PNG), PNG)).toThrow("does not match its hash");
    expect(readBlob(sha256Of(OTHER_PNG))).toBeUndefined();
  });

  it("stores identical bytes once, and skips missing ones when reading", () => {
    const sha256 = store(PNG);
    expect(store(PNG)).toBe(sha256);
    expect(blobs().filter((name) => name === sha256)).toHaveLength(1);
    expect(Object.keys(assetBytes([sha256, sha256Of(OTHER_PNG)]))).toEqual([sha256]);
  });
});

describe("collectOrphanedBlobs", () => {
  it("keeps every image a project holds or shows, and drops old unused ones", () => {
    const [kept, logo, dropped] = [PNG, LOGO_PNG, OTHER_PNG].map(store);
    const report = { ...REPORT_TEMPLATE, cover: { ...REPORT_TEMPLATE.cover, logoAssetId: logo! } };
    createProject({
      project: { name: "Test", companyName: "", teamName: "" },
      findings: {},
      assets: { [kept!]: { name: "kept.png", createdBy: "Alice", createdAt: 0 } },
      report,
    });

    collectOrphanedBlobs();
    expect(blobs()).toContain(dropped);

    collectOrphanedBlobs(Date.now() + 8 * DAY_MS);
    expect(blobs()).toEqual([kept, logo].toSorted());
  });
});
