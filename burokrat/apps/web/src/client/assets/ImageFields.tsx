import { IMAGE_NAME, type FindingState, type ImageDrafts } from "@burokrat/domain";
import { useCallback, useEffect, useRef } from "react";
import { assetUrl } from "../collections.ts";
import { MoveButtons } from "../components/MoveButtons.tsx";
import { SyncedInput } from "../editors/SyncedInput.tsx";
import { addImageFile } from "../images.ts";
import { useProjectSession } from "../project-session.ts";
import { toasts } from "../toasts.ts";
import { AssetPicker, type Asset } from "./AssetPicker.tsx";

type Images = FindingState["images"];

export type UpdateImages = (write: (images: ImageDrafts) => void) => void;

type Props = { images: Images; update: UpdateImages; userName: string };

/** A name `#image("...")` accepts, derived from the file name and unique in the list. */
function imageName(fileName: string, taken: Set<string>) {
  const stem = fileName.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-");
  const base = (/^[A-Za-z0-9_-]/.test(stem) ? stem : `image${stem}`).slice(0, 200);
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
}

/** Adds `asset` under a name derived from its file name, and returns that name. */
function addImage(update: UpdateImages, asset: Asset) {
  let name = "";
  update((images) => {
    name = imageName(asset.name, new Set(images.map((image) => image.name)));
    images.push({ assetId: asset.id, name, caption: "" });
  });
  return name;
}

/**
 * Adds a pasted image to the project and to the images, resolving to its name; a file that is
 * not accepted is reported in a toast and resolves to `undefined`.
 */
export function useImagePaste(update: UpdateImages, userName: string) {
  const session = useProjectSession();
  const latestUpdate = useRef(update);
  useEffect(() => {
    latestUpdate.current = update;
  });
  return useCallback(
    async (file: File) => {
      try {
        const id = await addImageFile(session, file, userName);
        return addImage(latestUpdate.current, { id, name: file.name });
      } catch (error) {
        toasts.add({
          title: "Could not attach the image",
          description: (error as Error).message,
          variant: "error",
        });
        return undefined;
      }
    },
    [session, userName],
  );
}

function nameError(name: string, index: number, images: Images) {
  if (!IMAGE_NAME.test(name)) return "Letters, digits, dots, dashes and underscores only";
  if (images.findIndex((image) => image.name === name) !== index) return "Name already used";
  return undefined;
}

export function ImageFields({ images, update, userName }: Props) {
  const { projectId } = useProjectSession();
  return (
    <div className="flex flex-col gap-3">
      {images.map((image, index) => (
        <div key={image.$cid} className="flex items-start gap-3">
          <img
            src={assetUrl(projectId, image.assetId)}
            alt=""
            className="size-24 shrink-0 rounded-md bg-kumo-tint object-contain"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <SyncedInput
              label="Name"
              description={`Use #image("${image.name}") in a text field`}
              value={image.name}
              maxLength={255}
              error={nameError(image.name, index, images)}
              onChange={(event) =>
                update((draft) => void (draft[index]!.name = event.target.value))
              }
            />
            <SyncedInput
              label="Caption"
              value={image.caption}
              maxLength={500}
              onChange={(event) =>
                update((draft) => void (draft[index]!.caption = event.target.value))
              }
            />
          </div>
          <MoveButtons index={index} count={images.length} label="image" update={update} />
        </div>
      ))}
      <div>
        <AssetPicker
          userName={userName}
          label="Image"
          onPick={(asset) => void addImage(update, asset)}
        />
      </div>
    </div>
  );
}
