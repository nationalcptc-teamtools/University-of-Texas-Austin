import { Sidebar, Tooltip } from "@cloudflare/kumo";
import { STATUS_LABELS, type MachineStatus } from "@burokrat/domain";
import {
  FolderIcon,
  HouseIcon,
  KeyIcon,
  ListBulletsIcon,
  PlugsConnectedIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { initial } from "../components/PageViewers.tsx";
import { ViewerDots } from "../components/ViewerDots.tsx";
import { presenceClass } from "../presence.ts";
import { useProjectSession } from "../project-session.ts";
import { formatAge, useMinuteClock } from "./claim-age.ts";
import { useFindingCounts } from "./links.ts";
import { useMachineList, type Machine } from "./use-machines.ts";

/** Work in hand first, done last. */
const GROUPS: MachineStatus[] = ["progress", "foothold", "untouched", "parked", "owned"];

type Props = { path: string };

/** Engage's sidebar: its pages, and the machines by status, out-of-scope ones folded away. */
export function MachineNav({ path }: Props) {
  const { projectId } = useProjectSession();
  const machines = useMachineList();
  const findingCounts = useFindingCounts();
  const now = useMinuteClock();
  const base = `/p/${projectId}/engage`;
  const inScope = machines.filter((machine) => machine.scope !== "out");
  const outOfScope = machines.filter((machine) => machine.scope === "out");
  const link = (machine: Machine) => {
    const href = `${base}/m/${machine.id}`;
    return (
      <MachineLink
        key={machine.id}
        machine={machine}
        href={href}
        active={path === href}
        findings={findingCounts.get(machine.id) ?? 0}
        now={now}
      />
    );
  };
  const page = (href: string) => ({ href, active: path === href });

  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.Menu>
          <Sidebar.MenuButton icon={HouseIcon} {...page(base)}>
            Overview
          </Sidebar.MenuButton>
          <Sidebar.MenuButton icon={ListBulletsIcon} {...page(`${base}/machines`)}>
            Machines
          </Sidebar.MenuButton>
          <Sidebar.MenuButton icon={PlugsConnectedIcon} {...page(`${base}/services`)}>
            Services
          </Sidebar.MenuButton>
          <Sidebar.MenuButton icon={FolderIcon} {...page(`${base}/files`)}>
            Files
          </Sidebar.MenuButton>
          <Sidebar.MenuButton icon={KeyIcon} {...page(`${base}/notes`)}>
            Credentials and notes
          </Sidebar.MenuButton>
        </Sidebar.Menu>
      </Sidebar.Group>
      <Sidebar.Separator />
      <Sidebar.Group>
        <Sidebar.Menu>
          <Sidebar.MenuButton icon={PlusIcon} href={`${base}#add`}>
            Add machines
          </Sidebar.MenuButton>
        </Sidebar.Menu>
      </Sidebar.Group>
      {GROUPS.map((status) => {
        const group = inScope.filter((machine) => machine.status === status);
        if (group.length === 0) return null;
        return (
          <Sidebar.Group key={status}>
            <Sidebar.GroupLabel>
              {STATUS_LABELS[status]} · {group.length}
            </Sidebar.GroupLabel>
            <Sidebar.Menu>{group.map(link)}</Sidebar.Menu>
          </Sidebar.Group>
        );
      })}
      {outOfScope.length > 0 && (
        <Sidebar.Group>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.Collapsible>
                <Sidebar.CollapsibleTrigger
                  render={
                    <Sidebar.MenuButton>
                      Out of scope · {outOfScope.length}
                      <Sidebar.MenuChevron />
                    </Sidebar.MenuButton>
                  }
                />
                <Sidebar.CollapsibleContent>
                  <Sidebar.Menu>{outOfScope.map(link)}</Sidebar.Menu>
                </Sidebar.CollapsibleContent>
              </Sidebar.Collapsible>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.Group>
      )}
    </Sidebar.Content>
  );
}

type MachineLinkProps = {
  machine: Machine;
  href: string;
  active: boolean;
  findings: number;
  now: number;
};

function MachineLink({ machine, href, active, findings, now }: MachineLinkProps) {
  const claim = `${machine.owner} has been on it for ${formatAge(machine.claimedAt, now)}`;
  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton href={href} active={active}>
        <span className="shrink-0 font-mono text-[0.9em]">{machine.ip || "No IP"}</span>
        <span className="min-w-0 flex-1 truncate text-kumo-subtle">{machine.hostname}</span>
        <ViewerDots href={href} />
        {findings > 0 && (
          <span className="text-xs text-kumo-subtle" title={`${findings} findings`}>
            {findings}
          </span>
        )}
        {machine.owner && (
          <Tooltip
            content={claim}
            delay={100}
            render={
              <span
                className={`${presenceClass(machine.owner)} flex size-4 shrink-0 items-center justify-center rounded-full bg-(--presence) text-[0.625rem] font-medium text-(--presence-ink,white)`}
              />
            }
          >
            <span aria-hidden>{initial(machine.owner)}</span>
            <span className="sr-only">{claim}</span>
          </Tooltip>
        )}
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  );
}
