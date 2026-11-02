import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { listProjectsFn } from "../projects.ts";

/** Lists are saved on this device, so they stay until replaced rather than expiring unused. */
export const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

export const projectsCollection = createCollection(
  queryCollectionOptions({
    id: "projects",
    queryKey: ["projects"],
    queryClient,
    queryFn: () => listProjectsFn(),
    getKey: (project) => project.id,
  }),
);

export const assetUrl = (projectId: string, assetId: string) =>
  `/api/p/${projectId}/assets/${assetId}`;

export const findingPdfUrl = (projectId: string, findingId: string) =>
  `/api/p/${projectId}/findings/${findingId}.pdf`;

export const findingJsonUrl = (projectId: string, findingId: string) =>
  `/api/p/${projectId}/findings/${findingId}.json`;

export const reportPdfUrl = (projectId: string) => `/api/p/${projectId}/report.pdf`;

export const reportSourceUrl = (projectId: string) => `/api/p/${projectId}/report-typst.zip`;
