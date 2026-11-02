import { Button, Text } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { unitOf, useProjectSession } from "../project-session.ts";
import { STRUCT, undoFormEdits } from "../undo-registry.ts";
import { machineLabel } from "./links.ts";
import { MachineFields } from "./MachineFields.tsx";
import { MachineFindings } from "./MachineFindings.tsx";
import { MachineNotes } from "./MachineNotes.tsx";
import { ServiceFields } from "./ServiceFields.tsx";
import { ScopeWarning, StatusBadge } from "./StatusBadge.tsx";
import { useMachine, useUpdateMachine } from "./use-machines.ts";

type Props = {
  machineId: string | undefined;
  open: boolean;
  userName: string;
  onClose: () => void;
};

/**
 * A machine slid in over the right of the table, to triage without leaving it. It does not take
 * the keyboard: the table's keys still move between machines, and the drawer follows.
 */
export function MachineDrawer({ machineId, open, userName, onClose }: Props) {
  return (
    <aside
      aria-label="Machine"
      inert={!open}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      className={`fixed inset-y-0 right-0 z-20 flex w-[32rem] max-w-[calc(100vw-1rem)] flex-col bg-kumo-base shadow-xl ring ring-kumo-line transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
    >
      {machineId && <DrawerContent machineId={machineId} userName={userName} onClose={onClose} />}
    </aside>
  );
}

function DrawerContent({
  machineId,
  userName,
  onClose,
}: Omit<Props, "open"> & { machineId: string }) {
  const session = useProjectSession();
  const machine = useMachine(machineId);
  const update = useUpdateMachine(machineId);
  if (!machine) return null;
  return (
    <>
      <header className="flex h-[58px] shrink-0 items-center gap-2 border-b border-kumo-line px-5">
        <Text bold DANGEROUS_className="min-w-0 truncate">
          {machineLabel(machine)}
        </Text>
        <StatusBadge status={machine.status} />
        <span className="flex-1" />
        <Link
          to="/p/$projectId/engage/m/$machineId"
          params={{ projectId: session.projectId, machineId }}
          aria-label="Open machine"
          title="Open machine"
          className="flex size-8 items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
        >
          <ArrowSquareOutIcon size={16} />
        </Link>
        <Button variant="ghost" shape="square" icon={XIcon} aria-label="Close" onClick={onClose} />
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4"
        onKeyDown={undoFormEdits(session.undo, unitOf(machineId, STRUCT))}
      >
        <ScopeWarning scope={machine.scope} note={machine.scopeNote} />
        <MachineFields machine={machine} update={update} />
        <MachineNotes key={machineId} machineId={machineId} userName={userName} />
        <DrawerSection title="Services">
          <ServiceFields machine={machine} update={update} />
        </DrawerSection>
        <DrawerSection title="Findings">
          <MachineFindings machineId={machineId} />
        </DrawerSection>
      </div>
    </>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <Text as="h3" bold>
        {title}
      </Text>
      {children}
    </section>
  );
}
