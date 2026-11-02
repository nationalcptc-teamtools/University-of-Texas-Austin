import { BLANK_FINDING } from "@burokrat/domain";
import { expect, it } from "vite-plus/test";
import { findingInput, type TypstData } from "./data.ts";
import { compileChecked, type Compilers } from "./fields.ts";

const BROKEN = "#broken-field";
const project = { companyName: "Acme", teamName: "Team" };

/** Fails on any unflagged text field that holds `BROKEN`, and returns the data it compiled. */
const fakeCompile: Compilers<TypstData> = {
  document: async (kind, data) => {
    const fields = data.findings.flatMap((f) => [f.description, f.remediation]);
    const broken = fields.some((field) => field.error === null && field.source.includes(BROKEN));
    return { result: data, error: broken ? `unknown variable (${kind})` : undefined };
  },
  field: async ({ field }) => (field.source.includes(BROKEN) ? "unknown variable" : undefined),
};

it("flags only the broken fields and compiles the rest", async () => {
  const { data } = findingInput(project, {
    ...BLANK_FINDING,
    description: `fine ${BROKEN}`,
    remediation: "*fine*",
  });
  const { result, error, broken } = await compileChecked("finding", data, fakeCompile);
  expect(error).toBeUndefined();
  expect(broken).toEqual([{ label: "Description", error: "unknown variable" }]);
  expect(result.findings[0]!.description.error).toBe("unknown variable");
  expect(result.findings[0]!.remediation.error).toBeNull();
  expect(data.findings[0]!.description.error).toBeNull();
});

it("names the broken fields without compiling again when refusing", async () => {
  const { data } = findingInput(project, { ...BLANK_FINDING, description: BROKEN });
  const { result, error, broken } = await compileChecked("finding", data, fakeCompile, {
    refuse: true,
  });
  expect(error).toBe("unknown variable (finding)");
  expect(broken).toEqual([{ label: "Description", error: "unknown variable" }]);
  expect(result.findings[0]!.description.error).toBeNull();
});

it("keeps the document error when no field fails alone", async () => {
  const { data } = findingInput(project, BLANK_FINDING);
  const failing: Compilers<null> = {
    document: async () => ({ result: null, error: "template broke" }),
    field: async () => undefined,
  };
  expect(await compileChecked("finding", data, failing)).toEqual({
    result: null,
    error: "template broke",
    broken: [],
  });
});
