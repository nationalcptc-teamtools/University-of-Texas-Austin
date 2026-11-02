import { findingContentSchema, type FindingContent } from "@burokrat/domain";
import { useNavigate } from "@tanstack/react-router";
import { useProjectSession } from "../project-session.ts";
import { toasts } from "../toasts.ts";
import { useFileDrop } from "../use-file-drop.ts";
import { addFinding } from "./actions.ts";

/** Generous for a finding's JSON, whose four prose fields are capped at 100,000 characters. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type FindingFile = { content: FindingContent; foreignImages: number } | { error: string };

/**
 * Reads a finding downloaded as JSON. Its images are kept only if they are this project's: the
 * download holds no image files.
 */
export async function readFindingFile(
  file: File,
  hasAsset: (assetId: string) => boolean,
): Promise<FindingFile> {
  if (file.size > MAX_FILE_BYTES) return { error: "The file is too large." };
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return { error: "The file is not JSON." };
  }
  const parsed = findingContentSchema.safeParse(json);
  if (!parsed.success) return { error: "The file is not a finding downloaded from Burokrat." };
  const images = parsed.data.images.filter((image) => hasAsset(image.assetId));
  return {
    content: { ...parsed.data, images },
    foreignImages: parsed.data.images.length - images.length,
  };
}

/** Adds the findings in JSON files dropped on an element, and opens the last one added. */
export function useFindingDrop(userName: string) {
  const session = useProjectSession();
  const navigate = useNavigate();

  async function add(files: File[]) {
    const hasAsset = (assetId: string) => assetId in session.store.getState().assets;
    let findingId: string | undefined;
    for (const file of files) {
      const read = await readFindingFile(file, hasAsset);
      if ("error" in read) {
        toasts.add({
          title: `${file.name} was not added`,
          description: read.error,
          variant: "error",
        });
        continue;
      }
      findingId = addFinding(session, read.content, userName);
      if (read.foreignImages > 0) {
        toasts.add({
          title: `${file.name} was added without its images`,
          description: "They belong to another project. Add them to this one again.",
        });
      }
    }
    const { projectId } = session;
    if (findingId)
      await navigate({ to: "/p/$projectId/f/$findingId", params: { projectId, findingId } });
  }

  return useFileDrop((files) => void add(files));
}
