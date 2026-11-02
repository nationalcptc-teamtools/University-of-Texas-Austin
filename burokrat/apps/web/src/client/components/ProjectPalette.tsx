import { CommandPalette } from "@cloudflare/kumo";
import { liveFindings, oneLine, STATUS_LABELS, type ProjectState } from "@burokrat/domain";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { modeOf, storeMode } from "../engage/mode.ts";
import { machineLabel, useFiles } from "../engage/links.ts";
import { useMachineList } from "../engage/use-machines.ts";
import { useProjectSession, useProjectState } from "../project-session.ts";

type Command = { id: string; title: string; hint: string; href: string; search: string };
type CommandGroup = { label: string; items: Command[] };

const selectFindings = (state: ProjectState) => state.findings;
const MAX_PER_GROUP = 8;

/** Everything the palette can go to, grouped. */
function useCommands(): CommandGroup[] {
  const { projectId } = useProjectSession();
  const machines = useMachineList();
  const findings = useProjectState(selectFindings);
  const files = useFiles();
  return useMemo(() => {
    const base = `/p/${projectId}`;
    const page = (title: string, href: string): Command => ({
      id: href,
      title,
      hint: "",
      href,
      search: title.toLowerCase(),
    });
    return [
      {
        label: "Pages",
        items: [
          page("Engage overview", `${base}/engage`),
          page("Add machines", `${base}/engage#add`),
          page("Machines", `${base}/engage/machines`),
          page("Services", `${base}/engage/services`),
          page("Files", `${base}/engage/files`),
          page("Credentials and notes", `${base}/engage/notes`),
          page("Report overview", base),
          page("Report", `${base}/report`),
        ],
      },
      {
        label: "Machines",
        items: machines.map((machine) => ({
          id: machine.id,
          title: machineLabel(machine),
          hint: STATUS_LABELS[machine.status],
          href: `${base}/engage/m/${machine.id}`,
          search: [machine.ip, machine.hostname, machine.os].join(" ").toLowerCase(),
        })),
      },
      {
        label: "Findings",
        items: liveFindings(findings).map((finding) => {
          const title = oneLine(finding.title) || "Untitled finding";
          return {
            id: finding.id,
            title,
            hint: "",
            href: `${base}/f/${finding.id}`,
            search: title.toLowerCase(),
          };
        }),
      },
      {
        label: "Files",
        items: files.map((file) => ({
          id: file.id,
          title: file.name || "Untitled",
          hint: "",
          href: `${base}/engage/files`,
          search: file.name.toLowerCase(),
        })),
      },
    ];
  }, [projectId, machines, findings, files]);
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** ⌘K: go to any page, machine, finding or file of the project, in either mode. */
export function ProjectPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { projectId } = useProjectSession();
  const groups = useCommands();
  const [query, setQuery] = useState("");
  const toggle = useEffectEvent(() => setOpen(!open));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function setOpen(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => words.every((word) => item.search.includes(word)))
        .slice(0, MAX_PER_GROUP),
    }))
    .filter((group) => group.items.length > 0);

  function go(command: Command) {
    setOpen(false);
    storeMode(modeOf(command.href.split("#")[0]!, `/p/${projectId}`));
    void navigate({ href: command.href });
  }

  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={setOpen}
      items={shown}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(group) => group.label}
      getSelectableItems={(all) => all.flatMap((group) => group.items)}
      onSelect={go}
    >
      <CommandPalette.Input placeholder="Go to a machine, finding, file or page…" />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(group: CommandGroup) => (
            <CommandPalette.Group key={group.label} items={group.items}>
              <CommandPalette.GroupLabel>{group.label}</CommandPalette.GroupLabel>
              <CommandPalette.Items>
                {(item: Command) => (
                  <CommandPalette.Item key={item.id} value={item} onClick={() => go(item)}>
                    <span className="flex w-full items-center gap-3">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.hint && <span className="text-kumo-subtle">{item.hint}</span>}
                    </span>
                  </CommandPalette.Item>
                )}
              </CommandPalette.Items>
            </CommandPalette.Group>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>Nothing matches.</CommandPalette.Empty>
      </CommandPalette.List>
    </CommandPalette.Root>
  );
}
