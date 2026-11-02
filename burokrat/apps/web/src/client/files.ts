import type { AssetState } from "@burokrat/domain";
import { clear, createStore, del, entries, set } from "idb-keyval";
import { assetUrl } from "./collections.ts";
import type { ProjectSession } from "./project-session.ts";
import { toasts } from "./toasts.ts";

export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/gif";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const IMAGES_CACHE = "images";

/** Files added on this device that the server may not have yet, by their SHA-256. */
const pending = createStore("burokrat-uploads", "uploads");
type PendingFile = { projectId: string; bytes: ArrayBuffer };

export const forgetPendingFiles = () => clear(pending).catch(() => {});

export const isImage = (type: string) => ACCEPTED_IMAGES.split(",").includes(type);

async function sha256Of(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Adds a file to the project's files, linked to `machineIds`, and resolves to its id, its
 * SHA-256. It shows at once, offline too, and is uploaded now or once the server can be reached.
 */
export async function addFile(
  session: ProjectSession,
  file: File,
  userName: string,
  machineIds: string[] = [],
) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Files are limited to 50 MB.");
  const bytes = await file.arrayBuffer();
  const id = await sha256Of(bytes);
  const { projectId } = session;
  const type = file.type || "application/octet-stream";
  const response = new Response(bytes, { headers: { "Content-Type": type } });
  const cache = await globalThis.caches?.open(IMAGES_CACHE);
  await cache?.put(assetUrl(projectId, id), response);
  await set(id, { projectId, bytes } satisfies PendingFile, pending);
  const asset = {
    name: file.name.slice(0, 200),
    type: type.slice(0, 200),
    size: file.size,
    machines: {},
    createdBy: userName,
    createdAt: Date.now(),
  };
  // Adding to the project's files is not an edit to undo.
  session.store.setState(
    (draft) => {
      const added = (draft.assets[id] ??= asset);
      for (const machineId of machineIds) added.machines[machineId] = true;
    },
    { origin: "sys:file" },
  );
  void uploadPendingFiles();
  return id;
}

/** Adds each file as {@link addFile} does, and says in a toast which could not be added. */
export async function addFiles(
  session: ProjectSession,
  files: File[],
  userName: string,
  machineIds: string[] = [],
) {
  for (const file of files) {
    try {
      await addFile(session, file, userName, machineIds);
    } catch (error) {
      toasts.add({
        title: `${file.name} was not added`,
        description: (error as Error).message,
        variant: "error",
      });
    }
  }
}

/** {@link addFile} for an image the report can show. */
export async function addImageFile(session: ProjectSession, file: File, userName: string) {
  if (!isImage(file.type)) throw new Error("Only PNG, JPEG and GIF images are accepted.");
  return addFile(session, file, userName);
}

let uploading: Promise<void> | undefined;

/** Uploads the files added on this device, stopping at the first that can't reach the server. */
export function uploadPendingFiles() {
  uploading ??= (async () => {
    for (const [id, file] of await entries<string, PendingFile>(pending)) {
      const url = assetUrl(file.projectId, id);
      const response = await fetch(url, { method: "PUT", body: file.bytes }).catch(() => {});
      if (!response || response.status === 401 || response.status >= 500) return;
      await del(id, pending);
      if (!response.ok) {
        toasts.add({
          title: "A file could not be uploaded",
          description: await response.text(),
          variant: "error",
        });
      }
    }
  })().finally(() => (uploading = undefined));
  return uploading;
}

/** Loads every image of the project, so the service worker keeps them for offline use. */
export async function cacheProjectImages(session: ProjectSession) {
  if (!navigator.serviceWorker?.controller) return;
  const assets: Record<string, AssetState> = session.store.getState().assets;
  for (const [id, asset] of Object.entries(assets)) {
    if (isImage(asset.type)) await fetch(assetUrl(session.projectId, id)).catch(() => {});
  }
}
