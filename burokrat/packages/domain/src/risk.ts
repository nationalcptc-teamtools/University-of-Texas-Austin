export const LEVELS = ["Informational", "Low", "Medium", "High", "Critical"] as const;

export type Level = 0 | 1 | 2 | 3 | 4;

export const LEVELS_HIGH_FIRST = [4, 3, 2, 1, 0] as const satisfies readonly Level[];

/** Overall risk by impact (rows) and likelihood (columns), each Low → Critical. */
export const RISK_MATRIX: readonly (readonly Level[])[] = [
  [1, 1, 2, 2],
  [1, 2, 3, 3],
  [1, 2, 3, 4],
  [1, 2, 4, 4],
];

/** Informational when either impact or likelihood is; otherwise the matrix. */
export function overallRisk(impact: Level, likelihood: Level): Level {
  if (impact === 0 || likelihood === 0) return 0;
  return RISK_MATRIX[impact - 1]![likelihood - 1]!;
}

export const RISK_COLORS: readonly { fg: string; bg: string; box: string }[] = [
  { fg: "#004c99", bg: "#cce5ff", box: "#5c9ae6" },
  { fg: "#f4cd61", bg: "#fff9ee", box: "#f4cd61" },
  { fg: "#e89a4c", bg: "#faecde", box: "#f6b26b" },
  { fg: "#e10018", bg: "#fae2e2", box: "#e16567" },
  { fg: "#674ea7", bg: "#ede5ff", box: "#674ea7" },
];

export const IMPACT_DEFINITIONS: readonly string[] = [
  "No direct effect on the confidentiality, integrity, or availability of the system or service. The finding is an observation or a deviation from best practice that could support future hardening.",
  "Affects only a small number of users and/or results in the disclosure of non-sensitive information (e.g., confirmation of user existence or other minor data exposure).",
  "Affects a specific subset of users and/or exposes sensitive information that could facilitate additional attacks or lateral movement.",
  "Compromise would have a serious effect on the confidentiality, integrity, or availability of the affected system or service.",
  "Compromise would have a major effect on the confidentiality, integrity, or availability of the system or service. The impact may extend to connected systems or individuals, potentially causing widespread disruption or harm.",
];

export const LIKELIHOOD_DEFINITIONS: readonly string[] = [
  "No practical exploitation path was identified; the issue does not provide an attacker with access or capabilities on its own.",
  "Exploitation requires high privileges on a component with specific configuration or deployment conditions, or depends on chaining multiple vulnerabilities together.",
  "Exploitation requires elevated privileges on a commonly accessible component, or the use of a custom-built exploit.",
  "Exploitation requires minimal privileges and can be executed with readily available tools or exploit code.",
  "Exploitation requires no authentication (or can be performed anonymously) and can be achieved using readily available tools or code.",
];
