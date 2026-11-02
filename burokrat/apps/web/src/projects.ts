import { REPORT_TEMPLATE } from "@burokrat/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createProject, listProjects } from "./server/projects.server.ts";
import { requireSession } from "./server/session.server.ts";
import { importProject, MAX_IMPORT_BYTES } from "./server/transfer.server.ts";

const projectInput = z.object({
  name: z.string().trim().min(1).max(100),
  companyName: z.string().trim().max(100),
  teamName: z.string().trim().max(100),
});

export const listProjectsFn = createServerFn().handler(async () => {
  await requireSession();
  return listProjects();
});

export const createProjectFn = createServerFn({ method: "POST" })
  .validator(projectInput)
  .handler(async ({ data }) => {
    await requireSession();
    return createProject({ project: data, findings: {}, assets: {}, report: REPORT_TEMPLATE });
  });

/** Creates a project from an exported zip. */
export const importProjectFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Expected a file");
    if (file.size > MAX_IMPORT_BYTES) throw new Error("The archive is too large.");
    return { file };
  })
  .handler(async ({ data: { file } }) => {
    await requireSession();
    return importProject(new Uint8Array(await file.arrayBuffer()));
  });
