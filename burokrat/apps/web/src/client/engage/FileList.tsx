import { Text } from "@cloudflare/kumo";
import { FileIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { assetUrl } from "../collections.ts";
import { isImage } from "../files.ts";
import { useProjectSession } from "../project-session.ts";
import { useFileDrop } from "../use-file-drop.ts";
import type { ProjectFile } from "./links.ts";

const UNITS = ["B", "KB", "MB"];

export function formatSize(bytes: number) {
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${UNITS[unit]}`;
}

/** An image's thumbnail, or a file icon. */
export function FileThumb({ file }: { file: ProjectFile }) {
  const { projectId } = useProjectSession();
  if (!isImage(file.type)) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-kumo-tint">
        <FileIcon size={20} />
      </span>
    );
  }
  return (
    <img
      src={assetUrl(projectId, file.id)}
      alt=""
      className="size-10 shrink-0 rounded-md bg-kumo-tint object-cover"
    />
  );
}

/** A link that downloads the file under its own name. */
export function FileLink({ file }: { file: ProjectFile }) {
  const { projectId } = useProjectSession();
  return (
    <a
      href={assetUrl(projectId, file.id)}
      download={file.name}
      className="block truncate text-kumo-link hover:underline"
    >
      {file.name || "Untitled"}
    </a>
  );
}

type ListProps = { files: ProjectFile[]; actions?: (file: ProjectFile) => ReactNode };

export function FileList({ files, actions }: ListProps) {
  if (files.length === 0) return <Text variant="secondary">No files yet.</Text>;
  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-2">
          <FileThumb file={file} />
          <span className="min-w-0 flex-1">
            <FileLink file={file} />
            <span className="block text-xs text-kumo-subtle">
              {formatSize(file.size)} · {file.createdBy}
            </span>
          </span>
          {actions?.(file)}
        </li>
      ))}
    </ul>
  );
}

/** A box to drop files on or click to pick them. */
export function FileDropZone({
  onFiles,
  hint,
}: {
  onFiles: (files: File[]) => void;
  hint: string;
}) {
  const { dropping, ...handlers } = useFileDrop(onFiles);
  return (
    <label
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-kumo-hairline px-4 py-3 text-center hover:bg-kumo-tint ${dropping ? "bg-kumo-tint ring-2 ring-kumo-brand" : ""}`}
      {...handlers}
    >
      <UploadSimpleIcon size={20} />
      <Text size="sm">{hint}</Text>
      <input
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </label>
  );
}
