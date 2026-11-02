import { Badge } from "@cloudflare/kumo";
import { LEVELS, type Level } from "@burokrat/domain";

export const RISK_VARIANTS = ["blue", "warning", "orange", "red", "purple"] as const;

export function RiskBadge({ risk }: { risk: Level }) {
  return <Badge variant={RISK_VARIANTS[risk]}>{LEVELS[risk]}</Badge>;
}
