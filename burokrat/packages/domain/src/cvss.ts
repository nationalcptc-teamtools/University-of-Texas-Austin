import * as cvssCalculator from "ae-cvss-calculator";

// A minified CJS bundle: Node's ESM loader only exposes it as `default`, bundlers as named exports.
const { Cvss4P0 } =
  (cvssCalculator as { default?: typeof cvssCalculator }).default ?? cvssCalculator;

const NONE_LOW_HIGH = { N: "None", L: "Low", H: "High" } as const;

/** CVSS 4.0 base metrics, in vector order. */
export const CVSS_METRICS = {
  AV: { name: "Attack Vector", values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" } },
  AC: { name: "Attack Complexity", values: { L: "Low", H: "High" } },
  AT: { name: "Attack Requirements", values: { N: "None", P: "Present" } },
  PR: { name: "Privileges Required", values: NONE_LOW_HIGH },
  UI: { name: "User Interaction", values: { N: "None", P: "Passive", A: "Active" } },
  VC: { name: "Vulnerable System Confidentiality", values: NONE_LOW_HIGH },
  VI: { name: "Vulnerable System Integrity", values: NONE_LOW_HIGH },
  VA: { name: "Vulnerable System Availability", values: NONE_LOW_HIGH },
  SC: { name: "Subsequent System Confidentiality", values: NONE_LOW_HIGH },
  SI: { name: "Subsequent System Integrity", values: NONE_LOW_HIGH },
  SA: { name: "Subsequent System Availability", values: NONE_LOW_HIGH },
} as const;

export type CvssMetric = keyof typeof CVSS_METRICS;

export type CvssMetrics = { [M in CvssMetric]?: keyof (typeof CVSS_METRICS)[M]["values"] };

export const CVSS_METRIC_KEYS = Object.keys(CVSS_METRICS) as CvssMetric[];

/** The vector and base score, or `undefined` until every metric is set. */
export function scoreCvss(metrics: CvssMetrics): { vector: string; score: number } | undefined {
  if (!CVSS_METRIC_KEYS.every((key) => metrics[key])) return undefined;
  const vector = `CVSS:4.0/${CVSS_METRIC_KEYS.map((key) => `${key}:${metrics[key]}`).join("/")}`;
  return { vector, score: new Cvss4P0(vector).calculateScores().overall };
}
