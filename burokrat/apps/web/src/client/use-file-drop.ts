import { useState, type DragEvent } from "react";

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/** Calls `onFiles` with files dropped on an element, and says whether some are over it. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dropping, setDropping] = useState(false);
  return {
    dropping,
    onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropping(true);
    },
    onDragLeave(event: DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDropping(false);
      onFiles([...event.dataTransfer.files]);
    },
  };
}
