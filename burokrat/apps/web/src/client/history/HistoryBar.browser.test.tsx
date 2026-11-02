import { LoroDoc } from "loro-crdt";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { HistoryBar } from "./HistoryBar.tsx";
import { recordAuthor } from "./versions.ts";

function edit(doc: LoroDoc, author: string, seconds: number, text: string) {
  const stop = recordAuthor(doc, author);
  const stamp = doc.subscribePreCommit(({ modifier }) => modifier.setTimestamp(seconds));
  const field = doc.getText("t");
  field.insert(field.length, text);
  doc.commit();
  stamp();
  stop();
}

test("the slider shows earlier versions and restores one", async () => {
  const doc = new LoroDoc();
  edit(doc, "Alice", 1_000, "first");
  edit(doc, "Bob", 1_100, " second");
  edit(doc, "Alice", 2_000, " third");
  let shown: LoroDoc | undefined;
  const origins: (string | undefined)[] = [];
  doc.subscribe((batch) => origins.push(batch.origin));

  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <HistoryBar doc={doc} scope={[["t"]]} onShow={(past) => (shown = past)} onClose={() => {}} />,
  );
  const restore = page.getByRole("button", { name: "Restore this version" });
  await expect.element(restore).toBeDisabled();
  await expect.element(page.getByText(/· current$/)).toBeVisible();

  await userEvent.tab();
  await userEvent.keyboard("{Home}");
  await expect.element(restore).toBeEnabled();
  await expect.poll(() => shown?.getText("t").toString()).toBe("first");

  await restore.click();
  expect(doc.getText("t").toString()).toBe("first");
  expect(origins).toEqual(["sys:restore"]);
  await expect.poll(() => shown).toBeUndefined();
  await expect.element(restore).toBeDisabled();
});
