import { expect, it } from "vite-plus/test";
import { overallRisk, type Level } from "./risk.ts";

it("derives overall risk from impact and likelihood", () => {
  const pairs: [Level, Level][] = [
    [1, 1],
    [1, 4],
    [2, 3],
    [3, 4],
    [4, 3],
    [4, 4],
    [0, 4],
    [4, 0],
  ];
  expect(pairs.map(([impact, likelihood]) => overallRisk(impact, likelihood))).toEqual([
    1, 2, 3, 4, 4, 4, 0, 0,
  ]);
});
