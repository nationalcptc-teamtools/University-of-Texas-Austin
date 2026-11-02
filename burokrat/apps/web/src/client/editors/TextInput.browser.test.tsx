import { LoroDoc } from "loro-crdt";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import type { DocSession } from "../sync-client.ts";
import { UndoRegistry } from "../undo-registry.ts";
import { TextInput } from "./TextInput.tsx";

test("someone else's edit keeps the caret where it was in the text", async () => {
  const doc = new LoroDoc();
  doc.getText("title").insert(0, "hello world");
  doc.commit();
  const remote = LoroDoc.fromSnapshot(doc.export({ mode: "snapshot" }));
  const session = { doc, undo: new UndoRegistry(doc) } as unknown as DocSession;
  const getText = () => doc.getText("title");

  const container = document.createElement("div");
  document.body.append(container);
  flushSync(() =>
    createRoot(container).render(
      <TextInput session={session} unit="title" getText={getText} label="Title" />,
    ),
  );
  const input = container.querySelector("input")!;
  input.focus();
  input.setSelectionRange(6, 6);

  remote.getText("title").insert(0, "oh, ");
  remote.commit();
  doc.import(remote.export({ mode: "update", from: doc.version() }));

  await expect.poll(() => input.value).toBe("oh, hello world");
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 10]);
});
