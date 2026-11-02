import { Badge, Button, Select } from "@cloudflare/kumo";
import { FileArrowUpIcon, XIcon } from "@phosphor-icons/react";
import { assetUrl } from "../collections.ts";
import { addFiles } from "../files.ts";
import { useProjectSession } from "../project-session.ts";
import { toasts } from "../toasts.ts";
import { FileDropZone, FileList } from "./FileList.tsx";
import { useImport } from "./ImportDialog.tsx";
import { machineLabel, useFiles, type ProjectFile } from "./links.ts";
import { useMachineList, type Machine } from "./use-machines.ts";

const isScan = (file: ProjectFile) => /xml/.test(file.type) || file.name.endsWith(".xml");

type Props = { userName: string };

/** Every file of the project, the machines each belongs to, and scans to import. */
export function ProjectFiles({ userName }: Props) {
  const session = useProjectSession();
  const files = useFiles();
  const machines = useMachineList();
  const openImport = useImport();

  function link(fileId: string, machineId: string, linked: boolean) {
    session.store.setState(
      (draft) => {
        const file = draft.assets[fileId]!;
        if (linked) file.machines[machineId] = true;
        else delete file.machines[machineId];
      },
      { origin: "sys:file" },
    );
  }

  async function importScan(file: ProjectFile) {
    const response = await fetch(assetUrl(session.projectId, file.id)).catch(() => undefined);
    if (!response?.ok) {
      toasts.add({ title: `Could not read ${file.name}`, variant: "error" });
      return;
    }
    openImport(await response.text(), file.name);
  }

  return (
    <div className="flex flex-col gap-4">
      <FileDropZone
        hint="Drop scans, loot, dumps or screenshots"
        onFiles={(dropped) => void addFiles(session, dropped, userName)}
      />
      <FileList
        files={files}
        actions={(file) => (
          <FileMachines
            file={file}
            machines={machines}
            onLink={(machineId, linked) => link(file.id, machineId, linked)}
            onImport={isScan(file) ? () => void importScan(file) : undefined}
          />
        )}
      />
    </div>
  );
}

type FileMachinesProps = {
  file: ProjectFile;
  machines: Machine[];
  onLink: (machineId: string, linked: boolean) => void;
  onImport?: () => void;
};

function FileMachines({ file, machines, onLink, onImport }: FileMachinesProps) {
  const linked = machines.filter((machine) => file.machines[machine.id]);
  const unlinked = machines
    .filter((machine) => !file.machines[machine.id])
    .map((machine) => ({ value: machine.id, label: machineLabel(machine) }));
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {linked.map((machine) => (
        <Badge key={machine.id} variant="neutral">
          <span className="font-mono text-[0.9em]">{machine.ip}</span>
          <button
            type="button"
            aria-label={`Remove from ${machineLabel(machine)}`}
            className="ml-1 hover:text-kumo-default"
            onClick={() => onLink(machine.id, false)}
          >
            <XIcon size={10} />
          </button>
        </Badge>
      ))}
      {unlinked.length > 0 && (
        <Select
          aria-label={`Add ${file.name} to a machine`}
          placeholder="Add to machine"
          value={null}
          items={unlinked}
          onValueChange={(machineId) => machineId && onLink(machineId, true)}
        />
      )}
      {onImport && (
        <Button size="sm" icon={FileArrowUpIcon} onClick={onImport}>
          Import
        </Button>
      )}
    </span>
  );
}
