import { LEVELS_HIGH_FIRST, overallRisk, liveFindings, type ProjectState } from "@burokrat/domain";
import { LayerCard, LinkButton, Text } from "@cloudflare/kumo";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, ToolbarLabel } from "../../../client/components/PageHeader.tsx";
import { PROJECT_FIELDS } from "../../../client/components/ProjectFields.tsx";
import { RiskBadge } from "../../../client/components/RiskBadge.tsx";
import { SyncedInput } from "../../../client/editors/SyncedInput.tsx";
import { storedMode } from "../../../client/engage/mode.ts";
import { CoverageGaps } from "../../../client/report/CoverageGaps.tsx";
import {
  unitOf,
  updateProject,
  useProjectSession,
  useProjectState,
} from "../../../client/project-session.ts";
import { STRUCT } from "../../../client/undo-registry.ts";
import { useOnline } from "../../../client/use-connection.ts";

export const Route = createFileRoute("/_authed/p/$projectId/")({
  beforeLoad: ({ params }) => {
    if (storedMode() === "engage") throw redirect({ to: "/p/$projectId/engage", params });
  },
  component: ProjectOverview,
});

const selectFindings = (state: ProjectState) => state.findings;
const selectProject = (state: ProjectState) => state.project;

function ProjectOverview() {
  const { projectId } = useProjectSession();
  const online = useOnline();
  const findings = useProjectState(selectFindings);
  const risks = useMemo(
    () => liveFindings(findings).map(({ impact, likelihood }) => overallRisk(impact, likelihood)),
    [findings],
  );

  return (
    <>
      <PageHeader title="Overview">
        <LinkButton
          href={`/api/p/${projectId}/export.zip`}
          variant="secondary"
          icon={DownloadSimpleIcon}
          disabled={!online}
        >
          <ToolbarLabel>Export</ToolbarLabel>
        </LinkButton>
      </PageHeader>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-5">
        <section aria-label="Findings by risk" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {LEVELS_HIGH_FIRST.map((risk) => (
            <LayerCard key={risk}>
              <LayerCard.Primary className="flex flex-col items-start gap-2 px-4 py-3">
                <RiskBadge risk={risk} />
                <Text variant="heading" size="lg" as="span">
                  {risks.filter((found) => found === risk).length}
                </Text>
              </LayerCard.Primary>
            </LayerCard>
          ))}
        </section>
        <CoverageGaps />
        <ProjectSettings />
      </div>
    </>
  );
}

/** The project's details, saved as they are typed; the report page's history covers them. */
function ProjectSettings() {
  const session = useProjectSession();
  const project = useProjectState(selectProject);

  return (
    <LayerCard>
      <LayerCard.Secondary>Settings</LayerCard.Secondary>
      <LayerCard.Primary className="flex flex-col gap-4">
        {PROJECT_FIELDS.map(({ key, ...field }) => (
          <SyncedInput
            key={key}
            maxLength={100}
            value={project[key]}
            onChange={(event) =>
              updateProject(session, unitOf("project", STRUCT), (draft) => {
                draft.project[key] = event.target.value;
              })
            }
            {...field}
          />
        ))}
      </LayerCard.Primary>
    </LayerCard>
  );
}
