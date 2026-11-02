import {
  liveFindings,
  oneLine,
  overallRisk,
  type AssetState,
  type FindingState,
  type ProjectState,
} from "@burokrat/domain";
import { useMemo } from "react";
import { useProjectState } from "../project-session.ts";

const selectFindings = (state: ProjectState) => state.findings;
const selectAssets = (state: ProjectState) => state.assets;

/** How many findings not deleted target each machine. */
export function useFindingCounts() {
  const findings = useProjectState(selectFindings);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const finding of liveFindings(findings))
      for (const machineId of Object.keys(finding.targets))
        counts.set(machineId, (counts.get(machineId) ?? 0) + 1);
    return counts;
  }, [findings]);
}

export type LinkedFinding = { id: string; title: string; risk: number; ports: string[] };

/** The findings not deleted that target the machine, highest risk first. */
export function useFindingsOf(machineId: string): LinkedFinding[] {
  const findings = useProjectState(selectFindings);
  return useMemo(
    () =>
      liveFindings(findings as Record<string, FindingState>)
        .filter((finding) => finding.targets[machineId])
        .map(({ id, title, impact, likelihood, targets }) => ({
          id,
          title: oneLine(title),
          risk: overallRisk(impact, likelihood),
          ports: Object.keys(targets[machineId]!),
        }))
        .sort((a, b) => b.risk - a.risk),
    [findings, machineId],
  );
}

export type ProjectFile = AssetState & { id: string };

/** The project's files, newest first; only the machine's when `machineId` is given. */
export function useFiles(machineId?: string): ProjectFile[] {
  const assets = useProjectState(selectAssets);
  return useMemo(
    () =>
      Object.entries(assets as Record<string, AssetState>)
        .filter(([, asset]) => !machineId || asset.machines[machineId])
        .map(([id, asset]) => ({ ...asset, id }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [assets, machineId],
  );
}

/** A machine as one line: its IP and hostname. */
export const machineLabel = (machine: { ip: string; hostname: string }) =>
  [machine.ip || "No IP", machine.hostname].filter(Boolean).join(" · ");
