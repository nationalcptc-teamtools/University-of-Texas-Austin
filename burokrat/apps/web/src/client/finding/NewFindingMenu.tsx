import { Badge, DropdownMenu, Sidebar } from "@cloudflare/kumo";
import { BLANK_FINDING, LEVELS, overallRisk, type Level } from "@burokrat/domain";
import { FINDING_TEMPLATES } from "@burokrat/domain/finding-templates";
import { PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { RISK_VARIANTS } from "../components/RiskBadge.tsx";
import { useProjectSession } from "../project-session.ts";
import { addFinding } from "./actions.ts";

/** A dot in the risk's colour, widening into its badge while the item is highlighted. */
function RiskDot({ risk }: { risk: Level }) {
  return (
    <Badge
      variant={RISK_VARIANTS[risk]}
      className="h-2.5 max-w-2.5 overflow-hidden px-0 transition-[max-width,height,padding] duration-150 group-data-highlighted/item:h-5 group-data-highlighted/item:max-w-28 group-data-highlighted/item:px-2"
    >
      <span className="opacity-0 group-data-highlighted/item:opacity-100">{LEVELS[risk]}</span>
    </Badge>
  );
}

/** Starts a finding, blank or from a template, and opens it. */
export function NewFindingMenu({ userName }: { userName: string }) {
  const navigate = useNavigate();
  const session = useProjectSession();

  async function create(template: number | null) {
    const content = template === null ? BLANK_FINDING : FINDING_TEMPLATES[template]!;
    const findingId = addFinding(session, content, userName);
    const { projectId } = session;
    await navigate({ to: "/p/$projectId/f/$findingId", params: { projectId, findingId } });
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={<Sidebar.MenuButton icon={PlusIcon}>New finding</Sidebar.MenuButton>}
      />
      <DropdownMenu.Content className="max-h-96 w-104 overflow-y-auto">
        <DropdownMenu.Item onClick={() => void create(null)}>Blank finding</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Label>From template</DropdownMenu.Label>
          {FINDING_TEMPLATES.map((template, index) => (
            <DropdownMenu.Item
              key={index}
              className="group/item"
              title={template.title}
              onClick={() => void create(index)}
            >
              <span className="min-w-0 flex-1 truncate">{template.title}</span>
              <RiskDot risk={overallRisk(template.impact, template.likelihood)} />
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
