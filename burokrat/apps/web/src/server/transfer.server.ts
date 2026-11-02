import { nanoid } from "nanoid";
import { projectDocSchema, projectInfoSchema, type ProjectContent } from "@burokrat/domain";
import { strFromU8, strToU8, Unzip, UnzipInflate, zipSync, type Zippable } from "fflate";
import { z } from "zod";
import { MAX_ASSET_BYTES, projectBlobs, readBlob, sha256Of, storeBlob } from "./assets.server.ts";
import { createProject, type ProjectRow } from "./projects.server.ts";

const FORMAT = 3;
const MANIFEST = "project.json";
/** Caps an upload, and what its entries may inflate to. */
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;
/** Input fed to the inflater between size checks: deflate expands it at most about 1000 times. */
const UNZIP_CHUNK_BYTES = 16 * 1024;

const blobPath = (sha256: string) => `blobs/${sha256}`;

const manifestSchema = z.strictObject({
  format: z.literal(FORMAT),
  content: projectDocSchema.extend({ project: projectInfoSchema }),
});

type Manifest = z.infer<typeof manifestSchema>;

/**
 * The project's live content and every file it holds that was uploaded, as a zip. Edit history
 * is not included.
 */
export function exportProject(content: ProjectContent): Uint8Array {
  const manifest: Manifest = { format: FORMAT, content };
  const files: Zippable = { [MANIFEST]: strToU8(JSON.stringify(manifest)) };
  for (const sha256 of projectBlobs(content)) {
    const bytes = readBlob(sha256);
    if (bytes) files[blobPath(sha256)] = [bytes, { level: 0 }];
  }
  return zipSync(files);
}

/**
 * Inflates the wanted entries, counting the bytes they actually inflate to: the sizes an archive
 * declares can lie, and inflating a small entry to gigabytes ties up the server even if the
 * output is thrown away.
 */
export function unzipLimited(zip: Uint8Array, wanted: (name: string) => boolean, limit: number) {
  const files: Record<string, Uint8Array> = {};
  let inflated = 0;
  const unzip = new Unzip((file) => {
    if (!wanted(file.name)) return;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      inflated += chunk.length;
      if (inflated > limit) throw new Error("The archive is too large.");
      chunks.push(chunk);
      if (final) files[file.name] = Buffer.concat(chunks);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < zip.length; offset += UNZIP_CHUNK_BYTES) {
    const end = offset + UNZIP_CHUNK_BYTES;
    unzip.push(zip.subarray(offset, end), end >= zip.length);
  }
  return files;
}

function readArchive(zip: Uint8Array) {
  const wanted = (name: string) => name === MANIFEST || name.startsWith("blobs/");
  const files = unzipLimited(zip, wanted, MAX_IMPORT_BYTES);
  const manifest = files[MANIFEST];
  if (!manifest) throw new Error(`The archive has no ${MANIFEST}.`);
  const parsed = manifestSchema.safeParse(JSON.parse(strFromU8(manifest)));
  if (!parsed.success)
    throw new Error(`${MANIFEST} is not valid: ${z.prettifyError(parsed.error)}`);
  const { content } = parsed.data;
  const blobs = new Map<string, Uint8Array>();
  for (const sha256 of projectBlobs(content)) {
    const bytes = files[blobPath(sha256)];
    if (!bytes) continue;
    if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error("A file is larger than 50 MB.");
    if (sha256Of(bytes) !== sha256) throw new Error(`${blobPath(sha256)} does not match its hash.`);
    blobs.set(sha256, bytes);
  }
  return { content, blobs };
}

/**
 * Creates a new project from an exported zip, next to the original if it is still here. All
 * checks run before anything is written. Files the export lacks stay missing, as they were.
 */
export function importProject(zip: Uint8Array): ProjectRow {
  const { content, blobs } = readArchive(zip);
  for (const [sha256, bytes] of blobs) storeBlob(sha256, bytes);
  return createProject(content, nanoid());
}
