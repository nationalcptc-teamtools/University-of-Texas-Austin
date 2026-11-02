import type { DocUpdateFragment, DocUpdateFragmentHeader, HexString } from "loro-protocol";

const MAX_BATCHES = 4;
const TIMEOUT_MS = 10_000;
/** The smallest fragment a header may announce, so a tiny update can't claim millions of parts. */
const MIN_FRAGMENT_BYTES = 1024;

type Batch = { header: DocUpdateFragmentHeader; parts: Uint8Array[]; received: number };

/** Why a batch was refused or dropped: too big, timed out, or not the size it announced. */
export type FragmentFailure = "too-large" | "timeout" | "invalid";

function concat(parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** Reassembles one connection's fragmented updates. */
export class FragmentAssembler {
  private batches = new Map<HexString, Batch & { timer: NodeJS.Timeout }>();

  constructor(
    private maxBytes: number,
    private onFailure: (header: DocUpdateFragmentHeader, failure: FragmentFailure) => void,
  ) {}

  start(header: DocUpdateFragmentHeader) {
    const { batchId, fragmentCount, totalSizeBytes } = header;
    const valid =
      totalSizeBytes > 0 &&
      totalSizeBytes <= this.maxBytes &&
      fragmentCount > 0 &&
      fragmentCount <= Math.ceil(totalSizeBytes / MIN_FRAGMENT_BYTES) &&
      !this.batches.has(batchId);
    if (!valid || this.batches.size >= MAX_BATCHES) return this.onFailure(header, "too-large");
    const timer = setTimeout(() => {
      this.batches.delete(batchId);
      this.onFailure(header, "timeout");
    }, TIMEOUT_MS).unref();
    this.batches.set(batchId, { header, parts: [], received: 0, timer });
  }

  /** The whole update once its last fragment arrives. */
  add({ batchId, index, fragment }: DocUpdateFragment) {
    const batch = this.batches.get(batchId);
    if (!batch || index < 0 || index >= batch.header.fragmentCount || batch.parts[index]) return;
    batch.parts[index] = fragment;
    if (++batch.received < batch.header.fragmentCount) return;
    clearTimeout(batch.timer);
    this.batches.delete(batchId);
    const update = concat(batch.parts);
    if (update.length !== batch.header.totalSizeBytes) {
      return this.onFailure(batch.header, "invalid");
    }
    return { header: batch.header, update };
  }

  clear() {
    for (const batch of this.batches.values()) clearTimeout(batch.timer);
    this.batches.clear();
  }
}
