import { BLANK_FINDING } from "@burokrat/domain";
import { expect, it } from "vite-plus/test";
import { readFindingFile } from "./use-finding-drop.ts";

const OURS = "a".repeat(64);
const THEIRS = "b".repeat(64);
const finding = {
  ...BLANK_FINDING,
  title: "Downloaded",
  images: [
    { assetId: OURS, name: "ours", caption: "" },
    { assetId: THEIRS, name: "theirs", caption: "" },
  ],
};
const fileOf = (text: string) => new File([text], "finding.json", { type: "application/json" });
const hasAsset = (assetId: string) => assetId === OURS;

it("reads a downloaded finding, keeping only this project's images", async () => {
  expect(await readFindingFile(fileOf(JSON.stringify(finding)), hasAsset)).toEqual({
    content: { ...finding, images: [finding.images[0]] },
    foreignImages: 1,
  });
});

it.each([
  ["not JSON", "{", "The file is not JSON."],
  [
    "not a finding",
    JSON.stringify({ title: "x" }),
    "The file is not a finding downloaded from Burokrat.",
  ],
  ["too large", " ".repeat(2 * 1024 * 1024 + 1), "The file is too large."],
])("refuses a file that is %s", async (_, text, error) => {
  expect(await readFindingFile(fileOf(text), hasAsset)).toEqual({ error });
});
