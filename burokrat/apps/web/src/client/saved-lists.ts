import { dehydrate, hydrate, type DehydratedState } from "@tanstack/query-core";
import { createStore, del, get, set } from "idb-keyval";
import { queryClient } from "./collections.ts";

const store = createStore("burokrat-lists", "lists");
const KEY = "queries";
const SAVE_DELAY_MS = 1_000;

let restored: Promise<void> | undefined;

/**
 * Loads the projects list saved on this device, so it shows offline, then saves it again shortly
 * after each change.
 */
export function restoreLists() {
  restored ??= (async () => {
    const saved = await get<DehydratedState>(KEY, store).catch(() => undefined);
    if (saved) hydrate(queryClient, saved);
    let timer: ReturnType<typeof setTimeout> | undefined;
    queryClient.getQueryCache().subscribe(() => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void set(KEY, dehydrate(queryClient), store).catch(() => {});
      }, SAVE_DELAY_MS);
    });
  })();
  return restored;
}

export const forgetLists = () => del(KEY, store).catch(() => {});
