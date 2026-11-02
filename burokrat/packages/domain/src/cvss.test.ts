import { expect, it } from "vite-plus/test";
import { scoreCvss } from "./cvss.ts";

const metrics = {
  AV: "N",
  AC: "L",
  AT: "N",
  PR: "N",
  UI: "N",
  VC: "H",
  VI: "H",
  VA: "H",
  SC: "N",
  SI: "N",
  SA: "N",
} as const;

it("scores a complete CVSS 4.0 vector", () => {
  expect(scoreCvss(metrics)).toEqual({
    vector: "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
    score: 9.3,
  });
});

it("does not score an incomplete vector", () => {
  expect(scoreCvss({ ...metrics, SA: undefined })).toBeUndefined();
});
