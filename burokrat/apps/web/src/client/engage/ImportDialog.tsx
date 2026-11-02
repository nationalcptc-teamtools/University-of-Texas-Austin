import { Badge, Button, Dialog, Select, Text } from "@cloudflare/kumo";
import {
  inRanges,
  parseHosts,
  planScan,
  summarizeScan,
  type MachineEntry,
  type MachineScope,
  type ProjectState,
  type ScannedHost,
} from "@burokrat/domain";
import { createContext, useContext, useMemo, useState, type SubmitEvent } from "react";
import { useProjectSession, useProjectState } from "../project-session.ts";
import { toasts } from "../toasts.ts";
import { excludedRanges, importScan } from "./actions.ts";
import { parseNmapXml } from "./nmap.ts";
import { SCOPE_ITEMS } from "./StatusBadge.tsx";

export type Scan = { hosts: ScannedHost[]; source: string };

/** The hosts in nmap XML, or else the addresses in any other text. */
export function scanOf(text: string): ScannedHost[] {
  if (text.trimStart().startsWith("<")) return parseNmapXml(text);
  return parseHosts(text).map((host) => ({ ...host, os: "", services: {} }));
}

/** Opens the import preview for `text`, read from `source`; false if it holds no hosts. */
export const ImportContext = createContext<(text: string, source: string) => boolean>(() => false);

export const useImport = () => useContext(ImportContext);

/** Reads `text` as a scan, or says in a toast why it can't. */
export function readScan(text: string, source: string): Scan | undefined {
  try {
    const hosts = scanOf(text);
    if (hosts.length > 0) return { hosts, source };
    toasts.add({ title: `No IP addresses in ${source}` });
  } catch (error) {
    toasts.add({ title: `Could not read ${source}`, description: (error as Error).message });
  }
  return undefined;
}

const selectMachines = (state: ProjectState) => state.machines;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type Props = { scan: Scan | undefined; userName: string; onClose: () => void };

/** What a scan would add and fill in, applied with Enter. Nothing typed by a person changes. */
export function ImportDialog({ scan, userName, onClose }: Props) {
  const session = useProjectSession();
  const machines = useProjectState(selectMachines) as Record<string, MachineEntry>;
  const plan = useMemo(() => scan && planScan(machines, scan.hosts), [machines, scan]);
  const excluded = useMemo(() => scan && excludedRanges(session), [session, scan]);
  const [scope, setScope] = useState<MachineScope>("in");
  const summary = plan && summarizeScan(plan);
  const empty = !summary || summary.machines + summary.services + summary.updated === 0;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plan && !empty) importScan(session, plan, userName, scope);
    onClose();
  }

  return (
    <Dialog.Root open={scan !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="text-lg font-semibold">Import {scan?.source}</Dialog.Title>
            <Dialog.Description className="text-kumo-subtle">
              Machines match on IP and services on port. Only empty fields are filled in.
            </Dialog.Description>
          </div>
          {summary && (
            <Text>
              {empty
                ? "Everything in it is already here."
                : [
                    `+${plural(summary.machines, "machine")}`,
                    `+${plural(summary.services, "service")}`,
                    `${summary.updated} updated`,
                  ].join(", ")}
            </Text>
          )}
          {plan && plan.added.length > 0 && (
            <>
              <ul className="max-h-48 overflow-y-auto font-mono text-[0.9em]">
                {plan.added.map((host) => (
                  <li key={host.ip} className="flex items-center gap-2">
                    {host.ip} {host.hostname}
                    {excluded && inRanges(host.ip, excluded) && (
                      <Badge variant="neutral">Excluded</Badge>
                    )}
                  </li>
                ))}
              </ul>
              <Select
                label="New machines are"
                description="Addresses on the project's excluded list are always out of scope."
                value={scope}
                items={SCOPE_ITEMS}
                onValueChange={(value) => value && setScope(value)}
              />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Dialog.Close render={(props) => <Button {...props}>Cancel</Button>} />
            <Button type="submit" variant="primary" autoFocus>
              {empty ? "Close" : "Import"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
