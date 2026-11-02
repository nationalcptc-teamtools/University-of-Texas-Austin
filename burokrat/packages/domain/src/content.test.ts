import { describe, expect, it } from "vite-plus/test";
import { findingContentSchema } from "./content.ts";
import { MITRE_BY_ID } from "./mitre.ts";
import { FINDING_TEMPLATES } from "./finding-templates.ts";

describe("seed templates", () => {
  it("reference known MITRE techniques", () => {
    const ids = FINDING_TEMPLATES.flatMap((template) => Object.keys(template.mitre));
    expect(ids.filter((id) => !MITRE_BY_ID.has(id))).toEqual([]);
  });
});

it("rejects out-of-range levels and unknown CVSS values", () => {
  const [template] = FINDING_TEMPLATES;
  expect(findingContentSchema.safeParse({ ...template, impact: 5 }).success).toBe(false);
  expect(findingContentSchema.safeParse({ ...template, cvss: { AV: "X" } }).success).toBe(false);
  expect(findingContentSchema.safeParse({ ...template, cvss: { XX: "N" } }).success).toBe(false);
});
