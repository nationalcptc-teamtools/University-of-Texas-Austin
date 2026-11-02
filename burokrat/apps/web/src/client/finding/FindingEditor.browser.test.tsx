import {
  BLANK_FINDING,
  createProjectDoc,
  projectMirrorSchema,
  REPORT_TEMPLATE,
} from "@burokrat/domain";
import { LoroDoc } from "loro-crdt";
import { Mirror } from "loro-mirror";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type * as Images from "../files.ts";
import { Presence } from "../presence.ts";
import { ProjectSessionContext, type ProjectSession } from "../project-session.ts";
import { UndoRegistry } from "../undo-registry.ts";
import { FindingEditor } from "./FindingEditor.tsx";
import { useFinding } from "./use-finding-store.ts";

vi.mock("../files.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof Images>()),
  addImageFile: async () => "a".repeat(64),
}));

const FINDING_ID = "aaaaaaaaaaaaaaaaaaaa1";

/** Two copies of one project that pass every local change to each other, as the server would. */
function linkedSessions(): ProjectSession[] {
  const first = createProjectDoc({
    project: { name: "Project", companyName: "", teamName: "" },
    findings: {
      [FINDING_ID]: {
        ...BLANK_FINDING,
        targets: {},
        owner: "Alice",
        createdBy: "Alice",
        createdAt: 0,
        deleted: false,
      },
    },
    machines: {},
    assets: {},
    credentials: {},
    engage: { outOfScope: "", notes: "" },
    report: REPORT_TEMPLATE,
  });
  const second = new LoroDoc();
  second.import(first.export({ mode: "snapshot" }));
  first.subscribeLocalUpdates((update) => void second.import(update));
  second.subscribeLocalUpdates((update) => void first.import(update));
  return [first, second].map((doc) => ({
    projectId: "project",
    doc,
    store: new Mirror({ doc, schema: projectMirrorSchema }),
    presence: new Presence(),
    undo: new UndoRegistry(doc),
    close() {},
  }));
}

function Editor({ userName }: { userName: string }) {
  const finding = useFinding(FINDING_ID);
  return finding && <FindingEditor findingId={FINDING_ID} finding={finding} userName={userName} />;
}

function mountEditor(session: ProjectSession, userName: string) {
  const container = document.createElement("div");
  container.dataset.testid = userName;
  document.body.append(container);
  createRoot(container).render(
    <ProjectSessionContext value={session}>
      <Editor userName={userName} />
    </ProjectSessionContext>,
  );
  return page.getByTestId(userName);
}

test("two collaborators see each other's edits", async () => {
  const [aliceSession, bobSession] = linkedSessions();
  const alice = mountEditor(aliceSession!, "Alice");
  const bob = mountEditor(bobSession!, "Bob");

  await alice.getByRole("textbox", { name: "Title", exact: true }).fill("SQL injection in login");
  await bob.getByRole("textbox", { name: "Description" }).click();
  await userEvent.keyboard("Found by Bob.");

  await expect
    .element(bob.getByRole("textbox", { name: "Title", exact: true }))
    .toHaveValue("SQL injection in login");
  await expect
    .element(alice.getByRole("textbox", { name: "Description" }))
    .toHaveTextContent("Found by Bob.");
});

test("a pasted image joins the finding's images and is shown where it was pasted", async () => {
  const [session] = linkedSessions();
  const editor = mountEditor(session!, "Carol");
  const description = editor.getByRole("textbox", { name: "Description" });
  await description.click();

  const clipboardData = new DataTransfer();
  clipboardData.items.add(new File(["png"], "screenshot.png", { type: "image/png" }));
  description
    .element()
    .dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));

  await expect.element(description).toHaveTextContent('#image("screenshot")');
  await expect.element(editor.getByRole("textbox", { name: "Name" })).toHaveValue("screenshot");
});
