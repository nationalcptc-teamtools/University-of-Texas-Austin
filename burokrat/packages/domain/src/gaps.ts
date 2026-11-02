import { liveFindings } from "./content.ts";
import { liveMachines, type MachineScope, type MachineStatus } from "./machines.ts";

type GapFinding = {
  createdAt: number;
  deleted: boolean;
  targets: Record<string, unknown>;
  scope: unknown[];
};
type GapMachine = {
  ip: string;
  hostname: string;
  deleted: boolean;
  status: MachineStatus;
  scope: MachineScope;
};

/**
 * What the report may be missing: machines in scope the team got into, with a foothold or owned,
 * that no finding targets, and findings that name no host, neither a machine nor a row of their own.
 */
export function coverageGaps<F extends GapFinding, M extends GapMachine>(
  findings: Record<string, F>,
  machines: Record<string, M>,
) {
  const live = liveFindings(findings);
  const present = liveMachines(machines);
  const presentIds = new Set(present.map((machine) => machine.id));
  const targeted = new Set(live.flatMap((finding) => Object.keys(finding.targets)));
  return {
    unreported: present.filter(
      (machine) =>
        (machine.status === "foothold" || machine.status === "owned") &&
        machine.scope !== "out" &&
        !targeted.has(machine.id),
    ),
    untargeted: live.filter(
      (finding) =>
        finding.scope.length === 0 &&
        !Object.keys(finding.targets).some((id) => presentIds.has(id)),
    ),
  };
}
