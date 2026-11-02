import { LinkProvider, Sidebar, Text, Tooltip, useSidebar } from "@cloudflare/kumo";
import {
  LEVELS,
  LEVELS_HIGH_FIRST,
  liveFindings,
  oneLine,
  overallRisk,
  type ProjectState,
} from "@burokrat/domain";
import { FileTextIcon, HouseIcon } from "@phosphor-icons/react";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FindingMenu } from "../finding/FindingMenu.tsx";
import { NewFindingMenu } from "../finding/NewFindingMenu.tsx";
import { useFindingDrop } from "../finding/use-finding-drop.ts";
import { presenceClass } from "../presence.ts";
import { useProjectSession, useProjectState } from "../project-session.ts";
import { useViewersOf } from "../use-project-presence.ts";
import { OwnerFilter, ownerLabel } from "./OwnerFilter.tsx";
import { RouterLink } from "./RouterLink.tsx";
import { UserMenu } from "./UserMenu.tsx";

type Finding = { id: string; title: string; owner: string; risk: number };

const selectProject = (state: ProjectState) => state.project;
const selectFindings = (state: ProjectState) => state.findings;

/** The findings not deleted, oldest first, as the list shows them. */
function useFindingList(): Finding[] {
  const findings = useProjectState(selectFindings);
  return useMemo(
    () =>
      liveFindings(findings).map(({ id, title, owner, impact, likelihood }) => ({
        id,
        title: oneLine(title),
        owner,
        risk: overallRisk(impact, likelihood),
      })),
    [findings],
  );
}

export function ProjectSidebar({ userName }: { userName: string }) {
  const { projectId } = useProjectSession();
  const project = useProjectState(selectProject);
  const path = useLocation({ select: (location) => location.pathname });
  const { setOpenMobile } = useSidebar();
  const [chosenOwner, setOwner] = useState("");
  const everyone = useFindingList();
  const owners = [...new Set(everyone.map((finding) => finding.owner))].sort((a, b) =>
    a.localeCompare(b),
  );
  const owner = chosenOwner === userName || owners.includes(chosenOwner) ? chosenOwner : "";
  const findings = owner ? everyone.filter((finding) => finding.owner === owner) : everyone;
  const base = `/p/${projectId}`;
  const { dropping, ...dropHandlers } = useFindingDrop(userName);

  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);

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
        <Sidebar.Content
          className={dropping ? "ring-2 ring-kumo-brand ring-inset" : undefined}
          {...dropHandlers}
        >
          <Sidebar.Group>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={HouseIcon} href={base} active={path === base}>
                Overview
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                icon={FileTextIcon}
                href={`${base}/report`}
                active={path === `${base}/report`}
              >
                Report
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Separator />
          <Sidebar.Group>
            <div className="flex h-8 items-center justify-between gap-2 pr-1 pl-3">
              <Text variant="secondary" size="sm" as="h2" bold truncate>
                {ownerLabel(owner, userName)}
              </Text>
              {everyone.length > 0 && (
                <OwnerFilter
                  owners={owners}
                  userName={userName}
                  value={owner}
                  onValueChange={setOwner}
                />
              )}
            </div>
            <Sidebar.Menu>
              <NewFindingMenu userName={userName} />
            </Sidebar.Menu>
          </Sidebar.Group>
          {LEVELS_HIGH_FIRST.map((risk) => {
            const group = findings.filter((finding) => finding.risk === risk);
            if (group.length === 0) return null;
            return (
              <Sidebar.Group key={risk}>
                <Sidebar.GroupLabel>
                  {LEVELS[risk]} · {group.length}
                </Sidebar.GroupLabel>
                <Sidebar.Menu>
                  {group.map((finding) => {
                    const href = `${base}/f/${finding.id}`;
                    return (
                      <FindingLink
                        key={finding.id}
                        finding={finding}
                        href={href}
                        active={path === href}
                        userName={userName}
                      />
                    );
                  })}
                </Sidebar.Menu>
              </Sidebar.Group>
            );
          })}
        </Sidebar.Content>
        <Sidebar.Footer className="px-2!">
          <UserMenu name={userName} />
        </Sidebar.Footer>
      </Sidebar>
    </LinkProvider>
  );
}

type FindingLinkProps = {
  finding: Finding;
  href: string;
  active: boolean;
  userName: string;
};

function FindingLink({ finding, href, active, userName }: FindingLinkProps) {
  const viewers = useViewersOf(href);
  return (
    <Sidebar.MenuItem className="group/finding">
      <Sidebar.MenuButton
        href={href}
        active={active}
        className="group-hover/finding:pr-9 group-has-[:focus-visible,[data-popup-open]]/finding:pr-9 pointer-coarse:pr-9"
      >
        <span className="min-w-0 flex-1 truncate">{finding.title || "Untitled"}</span>
        {viewers.map((name) => (
          <Tooltip
            key={name}
            content={name}
            delay={100}
            render={
              <span
                className={`${presenceClass(name)} size-2 shrink-0 rounded-full bg-(--presence)`}
              />
            }
          >
            <span className="sr-only">{name}</span>
          </Tooltip>
        ))}
      </Sidebar.MenuButton>
      <FindingMenu finding={finding} userName={userName} />
    </Sidebar.MenuItem>
  );
}
