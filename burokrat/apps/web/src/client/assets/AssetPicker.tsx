import { Button, Dialog, Text } from "@cloudflare/kumo";
import { ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import type { AssetEntry, ProjectState } from "@burokrat/domain";
import { useState, type DragEvent } from "react";
import { assetUrl } from "../collections.ts";
import { ACCEPTED_IMAGES, addImageFile } from "../images.ts";
import { useProjectSession, useProjectState } from "../project-session.ts";

/** One of the project's images: its SHA-256, and the name of the file it came from. */
export type Asset = { id: string; name: string };

type Props = { userName: string; label: string; onPick: (asset: Asset) => void };

const selectAssets = (state: ProjectState) => state.assets;

const newestFirst = (assets: Record<string, AssetEntry>) =>
  Object.entries(assets)
    .map(([id, asset]) => ({ id, ...asset }))
    .sort((a, b) => b.createdAt - a.createdAt);

/** Picks one of the project's images, or adds a new one and picks that. */
export function AssetPicker({ userName, label, onPick }: Props) {
  const [open, setOpen] = useState(false);

  function pick(asset: Asset) {
    onPick(asset);
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={(props) => (
          <Button {...props} icon={ImageIcon}>
            {label}
          </Button>
        )}
      />
      <Dialog size="xl" className="flex max-h-[80vh] flex-col gap-4 p-6">
        <Dialog.Title className="text-lg font-semibold">Choose an image</Dialog.Title>
        {open && <AssetGrid userName={userName} onPick={pick} />}
        <div className="flex justify-end">
          <Dialog.Close render={(props) => <Button {...props}>Cancel</Button>} />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

type GridProps = { userName: string; onPick: (asset: Asset) => void };

function AssetGrid({ userName, onPick }: GridProps) {
  const session = useProjectSession();
  const assets = newestFirst(useProjectState(selectAssets));
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function add(file: File | undefined) {
    if (!file) return;
    setError("");
    setAdding(true);
    try {
      onPick({ id: await addImageFile(session, file, userName), name: file.name });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    void add(event.dataTransfer.files[0]);
  }

  return (
    <>
      <label
        className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-kumo-hairline p-6 text-center hover:bg-kumo-tint"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <UploadSimpleIcon size={24} />
        <Text>{adding ? "Adding…" : "Drop an image here, or click to upload"}</Text>
        <Text variant="secondary" size="xs">
          PNG, JPEG or GIF, up to 10 MB
        </Text>
        <input
          type="file"
          accept={ACCEPTED_IMAGES}
          className="sr-only"
          disabled={adding}
          onChange={(event) => void add(event.target.files?.[0])}
        />
      </label>
      {error && <Text variant="error">{error}</Text>}
      <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 overflow-y-auto">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="flex flex-col gap-1 rounded-lg p-1 text-left hover:bg-kumo-tint"
            onClick={() => onPick(asset)}
          >
            <img
              src={assetUrl(session.projectId, asset.id)}
              alt=""
              className="aspect-square w-full rounded-md bg-kumo-tint object-contain"
            />
            <span className="truncate text-xs">{asset.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
