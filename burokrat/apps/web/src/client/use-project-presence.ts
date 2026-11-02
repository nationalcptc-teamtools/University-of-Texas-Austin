import { nanoid } from "nanoid";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Presence } from "./presence.ts";

/** Someone with the project open, and the path of the page they are on. */
export type Viewer = { name: string; page: string };

const isViewer = (value: unknown): value is Viewer =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "page" in value &&
  typeof value.page === "string";

const NO_ONE: ReturnType<Presence["others"]> = [];

/** Who else has the project of `presence` open, and which page each of them is on. */
export function useProjectPresence(presence: Presence, { name, page }: Viewer) {
  const [key] = useState(() => nanoid());

  useEffect(() => presence.set(key, { name, page }), [presence, key, name, page]);

  const subscribe = useCallback(
    (onChange: () => void) => presence.store.subscribe(onChange),
    [presence],
  );
  const others = useSyncExternalStore(
    subscribe,
    () => presence.others(),
    () => NO_ONE,
  );
  return useMemo(() => others.flatMap(([, value]) => (isViewer(value) ? [value] : [])), [others]);
}

/** Everyone else in the project, and the page this user is on. */
export const ProjectViewers = createContext<{ others: Viewer[]; page: string }>({
  others: [],
  page: "",
});

/** The names of the others on `page`, or on this user's page, once each. */
export function useViewersOf(page?: string) {
  const viewers = useContext(ProjectViewers);
  const on = page ?? viewers.page;
  return [...new Set(viewers.others.filter((other) => other.page === on).map(({ name }) => name))];
}
