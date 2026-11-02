import { LinkProvider, Sidebar, Tabs, Text, useSidebar } from "@cloudflare/kumo";
import type { ProjectState } from "@burokrat/domain";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MachineNav } from "../engage/MachineNav.tsx";
import { modeOf, storeMode, type Mode } from "../engage/mode.ts";
import { FindingNav } from "../finding/FindingNav.tsx";
import { useProjectSession, useProjectState } from "../project-session.ts";
import { RouterLink } from "./RouterLink.tsx";
import { UserMenu } from "./UserMenu.tsx";

const selectProject = (state: ProjectState) => state.project;

const MODES = [
  { value: "engage", label: "Engage" },
  { value: "report", label: "Report" },
];

const SEARCH_KEYS =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";

type Props = { userName: string; onSearch: () => void };

export function ProjectSidebar({ userName, onSearch }: Props) {
  const { projectId } = useProjectSession();
  const project = useProjectState(selectProject);
  const path = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const base = `/p/${projectId}`;
  const mode = modeOf(path, base);

  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);
  useEffect(() => storeMode(mode), [mode]);

  return (
    <LinkProvider component={RouterLink}>
      <Sidebar aria-label="Project">
        <Sidebar.ResizeHandle aria-label="Resize sidebar" />
        <Sidebar.Header className="flex-col items-stretch justify-center gap-0">
          <Text variant="heading" as="span" truncate>
            {project.name || "Untitled project"}
          </Text>
          {project.companyName && (
            <Text variant="secondary" size="sm" truncate>
              {project.companyName}
            </Text>
          )}
        </Sidebar.Header>
        <div className="flex flex-col gap-2 border-b border-kumo-line p-2">
          <Tabs
            tabs={MODES}
            value={mode}
            className="w-full"
            listClassName="w-full *:flex-1"
            onValueChange={(next) => {
              // Stored first: opening the project's root goes to the mode stored.
              storeMode(next as Mode);
              void navigate({ to: next === "engage" ? `${base}/engage` : base });
            }}
          />
          <Sidebar.Menu>
            <Sidebar.MenuButton icon={MagnifyingGlassIcon} onClick={onSearch}>
              Search
              <kbd className="ml-auto font-sans text-xs text-kumo-subtle">{SEARCH_KEYS}</kbd>
            </Sidebar.MenuButton>
          </Sidebar.Menu>
        </div>
        {mode === "engage" ? (
          <MachineNav path={path} />
        ) : (
          <FindingNav userName={userName} path={path} />
        )}
        <Sidebar.Footer className="px-2!">
          <UserMenu name={userName} />
        </Sidebar.Footer>
      </Sidebar>
    </LinkProvider>
  );
}
