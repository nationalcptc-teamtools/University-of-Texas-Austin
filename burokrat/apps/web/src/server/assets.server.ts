import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ProjectContent } from "@burokrat/domain";
import { dataDir } from "./db.server.ts";
import { listProjects, readProject } from "./projects.server.ts";

export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
/** Long enough for a file added offline to reach the doc after its bytes were uploaded. */
const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const SIGNATURES = [
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
] as const;

export function sniffImage(bytes: Uint8Array) {
  return SIGNATURES.find(({ magic }) => magic.every((byte, index) => bytes[index] === byte))?.mime;
}

export const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const blobsDir = () => join(dataDir(), "blobs");
const blobPath = (sha256: string) => join(blobsDir(), sha256);

/** A file's bytes by their SHA-256, or `undefined` if nobody uploaded them yet. */
export function readBlob(sha256: string) {
  return existsSync(blobPath(sha256)) ? readFileSync(blobPath(sha256)) : undefined;
}

/**
 * Stores a file under its SHA-256, which must be `sha256`. Storing the same bytes again does
 * nothing. Everything here is synchronous, so garbage collection never interleaves with a store.
 */
export function storeBlob(sha256: string, bytes: Uint8Array) {
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error("Files are limited to 50 MB.");
  if (sha256Of(bytes) !== sha256) throw new Error("The file does not match its hash.");
  const path = blobPath(sha256);
  if (existsSync(path)) return;
  mkdirSync(blobsDir(), { recursive: true });
  const temp = `${path}.${nanoid()}.tmp`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
}

/** Bytes for the given hashes, skipping any not uploaded yet. */
export function assetBytes(sha256s: string[]): Record<string, Uint8Array> {
  return Object.fromEntries(
    sha256s.flatMap((sha256) => {
      const bytes = readBlob(sha256);
      return bytes ? [[sha256, bytes]] : [];
    }),
  );
}

/** Every file the project holds or shows, deleted findings included so they can be restored. */
export function projectBlobs({ assets, findings, report }: ProjectContent) {
  return new Set(
    [
      ...Object.keys(assets),
      report.cover.logoAssetId,
      report.cover.imageAssetId,
      ...report.images.map((image) => image.assetId),
      ...Object.values(findings).flatMap((finding) => finding.images.map((image) => image.assetId)),
    ].filter(Boolean),
  );
}

/** Removes blobs no project holds, once they are older than the grace period. */
export function collectOrphanedBlobs(now = Date.now()) {
  if (!existsSync(blobsDir())) return;
  const kept = new Set(
    listProjects().flatMap(({ id }) => {
      const content = readProject(id);
      return content ? [...projectBlobs(content)] : [];
    }),
  );
  for (const file of readdirSync(blobsDir())) {
    const path = join(blobsDir(), file);
    if (!kept.has(file) && statSync(path).mtimeMs < now - ORPHAN_GRACE_MS) rmSync(path);
  }
}
