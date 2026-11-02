import { Text } from "@cloudflare/kumo";
import { portLabel, type Level } from "@burokrat/domain";
import { Link } from "@tanstack/react-router";
import { RiskBadge } from "../components/RiskBadge.tsx";
import { useProjectSession } from "../project-session.ts";
import { useFindingsOf } from "./links.ts";

/** The findings that target the machine, each opening in Report. */
export function MachineFindings({ machineId }: { machineId: string }) {
  const { projectId } = useProjectSession();
  const findings = useFindingsOf(machineId);
  if (findings.length === 0) return <Text variant="secondary">No findings target it yet.</Text>;
  return (
    <ul className="flex flex-col">
      {findings.map((finding) => (
        <li key={finding.id}>
          <Link
            to="/p/$projectId/f/$findingId"
            params={{ projectId, findingId: finding.id }}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-kumo-tint"
          >
            <RiskBadge risk={finding.risk as Level} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{finding.title || "Untitled"}</span>
              {finding.ports.length > 0 && (
                <span className="block truncate text-xs text-kumo-subtle">
                  {finding.ports.map(portLabel).join(", ")}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
