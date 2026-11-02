import reportTemplate from "../data/report_template.json" with { type: "json" };
import { reportContentSchema, type FindingContent } from "./content.ts";

export const REPORT_TEMPLATE = reportContentSchema.parse(reportTemplate);

export const BLANK_FINDING: FindingContent = {
  title: "",
  impact: 0,
  likelihood: 0,
  cvss: {},
  mitre: {},
  scope: [],
  references: [],
  images: [],
  description: "",
  businessImpact: "",
  exploitDetails: "",
  remediation: "",
};
