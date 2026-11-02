import {
  createProjectDoc,
  projectMirrorSchema,
  REPORT_TEMPLATE,
  type MachineEntry,
} from "@burokrat/domain";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Mirror } from "loro-mirror";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { Presence } from "../presence.ts";
import { ProjectSessionContext, type ProjectSession } from "../project-session.ts";
import { UndoRegistry } from "../undo-registry.ts";
import { MachineTable } from "./MachineTable.tsx";

const machine = (ip: string, fields: Partial<MachineEntry> = {}): MachineEntry => ({
  ip,
  hostname: "",
  os: "",
  status: "untouched",
  scope: "in",
  scopeNote: "",
  claimedAt: 0,
  services: {},
  notes: "",
  owner: "",
  createdBy: "Alice",
  createdAt: 0,
  deleted: false,
  ...fields,
});

function sessionWith(machines: Record<string, MachineEntry>): ProjectSession {
  const doc = createProjectDoc({
    project: { name: "Project", companyName: "", teamName: "" },
    findings: {},
    machines,
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

function mountTable(session: ProjectSession) {
  const rootRoute = createRootRoute({
    component: () => (
      <ProjectSessionContext value={session}>
        <MachineTable userName="Alice" />
      </ProjectSessionContext>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(<RouterProvider router={router} />);
  unmount = () => {
    root.unmount();
    container.remove();
  };
}

let unmount = () => {};
afterEach(() => unmount());

test("filters machines, and triages the focused one by key", async () => {
  const session = sessionWith({
    ["d".repeat(21)]: machine("10.0.0.23", {
      services: { "445/tcp": { name: "microsoft-ds", product: "", note: "" } },
    }),
    ["w".repeat(21)]: machine("10.0.0.31", {
      services: { "80/tcp": { name: "http", product: "nginx", note: "" } },
    }),
    ["p".repeat(21)]: machine("10.0.0.99", { scope: "out" }),
  });
  mountTable(session);
  const rows = () => page.getByRole("row").filter({ hasText: /10\.0\.0\./ });

  await expect.poll(() => rows().all()).toHaveLength(2);
  const filter = page.getByRole("textbox", { name: "Filter machines" });
  await filter.fill("port:80");
  await expect.poll(() => rows().all()).toHaveLength(1);
  await expect.element(page.getByRole("link", { name: "10.0.0.31" })).toBeVisible();

  await filter.fill("");
  await userEvent.keyboard("{Escape}");
  await userEvent.keyboard("j4a");
  await expect
    .poll(() => session.store.getState().machines["w".repeat(21)])
    .toMatchObject({ status: "owned", owner: "Alice" });
  expect(session.store.getState().machines["d".repeat(21)]).toMatchObject({
    status: "untouched",
    owner: "",
  });
});

test("opens the focused machine in a drawer that follows the focus", async () => {
  const session = sessionWith({
    ["d".repeat(21)]: machine("10.0.0.23"),
    ["w".repeat(21)]: machine("10.0.0.31"),
  });
  mountTable(session);
  const drawer = page.getByRole("complementary", { name: "Machine" });

  await expect.element(page.getByRole("link", { name: "10.0.0.31" })).toBeVisible();
  await userEvent.keyboard(" ");
  await expect.element(drawer.getByLabelText("IP address")).toHaveValue("10.0.0.23");
  await userEvent.keyboard("j");
  await expect.element(drawer.getByLabelText("IP address")).toHaveValue("10.0.0.31");
  await userEvent.keyboard("{Escape}");
  await expect.element(drawer).toHaveAttribute("inert");
});
