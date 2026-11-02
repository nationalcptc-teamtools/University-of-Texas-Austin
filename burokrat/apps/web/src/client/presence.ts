import { PRESENCE_TIMEOUT_MS } from "@burokrat/domain";
import { EphemeralStore, type Value } from "loro-crdt";

const COLORS = 8;

function colorIndex(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % COLORS;
}

/** A class from `styles.css` that sets `--presence` to this person's colour. */
export const presenceClass = (name: string) => `presence-${colorIndex(name)}`;

/** A presence store that knows which keys are ours. */
export class Presence {
  readonly store = new EphemeralStore(PRESENCE_TIMEOUT_MS);
  private own = new Set<string>();
  private snapshot?: [string, Value | undefined][];

  constructor() {
    this.store.subscribe(() => (this.snapshot = undefined));
  }

  set(key: string, value: Value) {
    this.own.add(key);
    this.store.set(key, value);
  }

  delete(key: string) {
    this.own.delete(key);
    this.store.delete(key);
  }

  /** Everyone else's keys and values; the same array until the store changes. */
  others() {
    this.snapshot ??= Object.entries(this.store.getAllStates()).filter(
      ([key]) => !this.own.has(key),
    );
    return this.snapshot;
  }

  /** Sets our keys again, so they don't expire while we idle. */
  refresh() {
    for (const key of this.own) this.store.set(key, this.store.get(key));
  }

  clear() {
    for (const key of this.own) this.store.delete(key);
    this.own.clear();
  }
}
