import { expect, it } from "vite-plus/test";
import { coverageGaps } from "./gaps.ts";

const DC = "d".repeat(21);
const WEB = "w".repeat(21);
const machine = {
  ip: "10.0.0.1",
  hostname: "",
  deleted: false,
  status: "owned" as const,
  scope: "in" as const,
};
const finding = { createdAt: 0, deleted: false, targets: {}, scope: [] };

it("finds machines the team got into that no finding targets, and findings that name no host", () => {
  const gaps = coverageGaps(
    {
      reported: { ...finding, targets: { [DC]: {} } },
      hostless: finding,
      ownRows: { ...finding, scope: [{ ip: "10.0.0.9" }] },
      deletedTarget: { ...finding, targets: { gone: {} } },
    },
    {
      [DC]: machine,
      [WEB]: { ...machine, ip: "10.0.0.2" },
      foothold: { ...machine, ip: "10.0.0.3", status: "foothold" as const },
      untouched: { ...machine, ip: "10.0.0.4", status: "untouched" as const },
      out: { ...machine, scope: "out" as const },
      gone: { ...machine, deleted: true },
    },
  );
  expect(gaps.unreported.map(({ id }) => id)).toEqual([WEB, "foothold"]);
  expect(gaps.untargeted.map(({ id }) => id).sort()).toEqual(["deletedTarget", "hostless"]);
});
