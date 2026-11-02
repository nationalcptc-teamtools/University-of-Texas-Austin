import { clear, createStore, del, entries, set } from "idb-keyval";
import { assetUrl } from "./collections.ts";
import type { ProjectSession } from "./project-session.ts";
import { toasts } from "./toasts.ts";

export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/gif";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGES_CACHE = "images";

/** Images added on this device that the server may not have yet, by their SHA-256. */
const pending = createStore("burokrat-uploads", "uploads");
type PendingImage = { projectId: string; bytes: ArrayBuffer };

export const forgetPendingImages = () => clear(pending).catch(() => {});

async function sha256Of(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Adds an image file to the project's images and resolves to its id, its SHA-256. It shows at
 * once, offline too, and is uploaded now or once the server can be reached.
 */
export async function addImageFile(session: ProjectSession, file: File, userName: string) {
  if (!ACCEPTED_IMAGES.split(",").includes(file.type)) {
    throw new Error("Only PNG, JPEG and GIF images are accepted.");
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images are limited to 10 MB.");
  const bytes = await file.arrayBuffer();
  const id = await sha256Of(bytes);
  const { projectId } = session;
  const response = new Response(bytes, { headers: { "Content-Type": file.type } });
  const cache = await globalThis.caches?.open(IMAGES_CACHE);
  await cache?.put(assetUrl(projectId, id), response);
  await set(id, { projectId, bytes } satisfies PendingImage, pending);
  const asset = { name: file.name.slice(0, 200), createdBy: userName, createdAt: Date.now() };
  // Adding to the project's images is not an edit to undo.
  session.store.setState((draft) => void (draft.assets[id] ??= asset), { origin: "sys:image" });
  void uploadPendingImages();
  return id;
}

let uploading: Promise<void> | undefined;

/** Uploads the images added on this device, stopping at the first that can't reach the server. */
export function uploadPendingImages() {
  uploading ??= (async () => {
    for (const [id, image] of await entries<string, PendingImage>(pending)) {
      const url = assetUrl(image.projectId, id);
      const response = await fetch(url, { method: "PUT", body: image.bytes }).catch(() => {});
      if (!response || response.status === 401 || response.status >= 500) return;
      await del(id, pending);
      if (!response.ok) {
        toasts.add({
          title: "An image could not be uploaded",
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
  for (const id of Object.keys(session.store.getState().assets)) {
    await fetch(assetUrl(session.projectId, id)).catch(() => {});
  }
}
