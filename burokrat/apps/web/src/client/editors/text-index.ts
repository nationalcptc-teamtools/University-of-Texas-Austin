import type { TextDiff } from "loro-crdt";

/**
 * Where a position in the old text lands after `diff`: text inserted before it pushes it right,
 * text deleted before it pulls it left, and an insert right at it stays after it.
 */
export function mapIndex({ diff }: TextDiff, index: number) {
  let old = 0;
  let shift = 0;
  for (const delta of diff) {
    if (old >= index) break;
    if (delta.retain !== undefined) old += delta.retain;
    else if (delta.insert !== undefined) shift += delta.insert.length;
    else if (delta.delete !== undefined) {
      shift -= Math.min(delta.delete, index - old);
      old += delta.delete;
    }
  }
  return index + shift;
}

/**
 * Where a position in `before` lands in `after`, taking the change between them as one run of
 * replaced text. A position inside that run lands at its end.
 */
export function moveIndex(before: string, after: string, index: number) {
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before[start] === after[start]) start++;
  let end = 0;
  while (end < shortest - start && before.at(-1 - end) === after.at(-1 - end)) end++;
  if (index <= start) return index;
  if (index >= before.length - end) return index + after.length - before.length;
  return after.length - end;
}
