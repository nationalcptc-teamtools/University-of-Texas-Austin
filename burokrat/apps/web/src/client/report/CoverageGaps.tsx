import { Banner } from "@cloudflare/kumo";
import { coverageGaps, oneLine, type ProjectState } from "@burokrat/domain";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { machineLabel } from "../engage/links.ts";
import { useProjectSession, useProjectState } from "../project-session.ts";

const selectFindings = (state: ProjectState) => state.findings;
const selectMachines = (state: ProjectState) => state.machines;

/** Machines the team got into that the report says nothing about, and findings that name no host. */
export function CoverageGaps() {
  const { projectId } = useProjectSession();
  const findings = useProjectState(selectFindings);
  const machines = useProjectState(selectMachines);
  const { unreported, untargeted } = useMemo(
    () => coverageGaps(findings, machines),
    [findings, machines],
  );
  if (unreported.length === 0 && untargeted.length === 0) return null;
  return (
    <Banner
      variant="alert"
      title="The report may be missing something"
      description={
        <ul className="list-disc pl-4">
          {unreported.map((machine) => (
            <li key={machine.id}>
              <Link
                to="/p/$projectId/engage/m/$machineId"
                params={{ projectId, machineId: machine.id }}
                className="font-medium hover:underline"
              >
                {machineLabel(machine)}
              </Link>{" "}
              {machine.status === "owned" ? "is owned" : "has a foothold"}, but no finding targets
              it.
            </li>
          ))}
          {untargeted.map((finding) => (
            <li key={finding.id}>
              <Link
                to="/p/$projectId/f/$findingId"
                params={{ projectId, findingId: finding.id }}
                className="font-medium hover:underline"
              >
                {oneLine(finding.title) || "Untitled finding"}
              </Link>{" "}
              names no host in its scope.
            </li>
          ))}
        </ul>
      }
    />
  );
}
