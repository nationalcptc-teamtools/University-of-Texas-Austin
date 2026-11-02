import {
  BLANK_FINDING,
  createProjectDoc,
  projectMirrorSchema,
  REPORT_TEMPLATE,
} from "@burokrat/domain";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Mirror } from "loro-mirror";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { Presence } from "../presence.ts";
import { ProjectSessionContext, type ProjectSession } from "../project-session.ts";
import { UndoRegistry } from "../undo-registry.ts";
import { TargetFields } from "./TargetFields.tsx";
import { useFinding, useUpdateFinding } from "./use-finding-store.ts";

const FINDING_ID = "f".repeat(21);
const DC = "d".repeat(21);
const meta = { createdBy: "Alice", createdAt: 0, deleted: false };

function session(): ProjectSession {
  const doc = createProjectDoc({
    project: { name: "Project", companyName: "", teamName: "" },
    findings: { [FINDING_ID]: { ...BLANK_FINDING, targets: {}, owner: "", ...meta } },
    machines: {
      [DC]: {
        ip: "10.0.0.23",
        hostname: "dc01",
        os: "",
        status: "owned",
        scope: "in",
        scopeNote: "",
        claimedAt: 0,
        services: { "445/tcp": { name: "smb", product: "", note: "" } },
        notes: "",
        owner: "",
        ...meta,
      },
    },
    assets: {},
    credentials: {},
    engage: { outOfScope: "", notes: "" },
    report: REPORT_TEMPLATE,
  });
  return {
    projectId: "project",
    doc,
    store: new Mirror({ doc, schema: projectMirrorSchema }),
    presence: new Presence(),
    undo: new UndoRegistry(doc),
    close() {},
  };
}

function Targets() {
  const finding = useFinding(FINDING_ID);
  const update = useUpdateFinding(FINDING_ID);
  return finding && <TargetFields finding={finding} update={update} />;
}

test("picks a machine from Engage and the services the finding affects", async () => {
  const project = session();
  const rootRoute = createRootRoute({
    component: () => (
      <ProjectSessionContext value={project}>
        <Targets />
      </ProjectSessionContext>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<RouterProvider router={router} />);

  await page.getByRole("combobox", { name: "Add a machine" }).click();
  await page.getByRole("option", { name: "10.0.0.23 · dc01" }).click();
  await page.getByRole("checkbox", { name: "TCP/445 smb" }).click();

  await expect
    .poll(() => project.store.getState().findings[FINDING_ID]!.targets[DC])
    .toMatchObject({ "445/tcp": true });
  await expect.element(page.getByRole("link", { name: "10.0.0.23 · dc01" })).toBeVisible();
});
