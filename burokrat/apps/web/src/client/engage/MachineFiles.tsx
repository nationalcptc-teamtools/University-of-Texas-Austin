import { Button } from "@cloudflare/kumo";
import { LinkBreakIcon } from "@phosphor-icons/react";
import { addFiles } from "../files.ts";
import { useProjectSession } from "../project-session.ts";
import { FileDropZone, FileList } from "./FileList.tsx";
import { useFiles } from "./links.ts";

type Props = { machineId: string; userName: string };

/** The files that belong to the machine; dropping files here adds them to it. */
export function MachineFiles({ machineId, userName }: Props) {
  const session = useProjectSession();
  const files = useFiles(machineId);

  function unlink(fileId: string) {
    session.store.setState((draft) => void delete draft.assets[fileId]!.machines[machineId], {
      origin: "sys:file",
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <FileList
        files={files}
        actions={(file) => (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={LinkBreakIcon}
            aria-label={`Remove ${file.name} from this machine`}
            onClick={() => unlink(file.id)}
          />
        )}
      />
      <FileDropZone
        hint="Drop scans, loot or screenshots"
        onFiles={(dropped) => void addFiles(session, dropped, userName, [machineId])}
      />
    </div>
  );
}
