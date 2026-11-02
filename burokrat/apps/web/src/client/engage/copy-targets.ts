import { copyText } from "../copy-text.ts";

type Target = { machine: { scope: string }; line: string };

/**
 * Copies the targets' lines, once each, for a tool to aim at. Only machines in scope are copied:
 * a caution host is for a person to decide on, not a list to spray.
 */
export function copyTargets(targets: Target[], what: string) {
  const safe = targets.filter((target) => target.machine.scope === "in");
  const lines = [...new Set(safe.map((target) => target.line))];
  const left = targets.length - safe.length;
  const note = left > 0 ? `Left out ${left} on caution or out-of-scope machines.` : undefined;
  return copyText(lines.join("\n"), `${lines.length} ${what}`, note);
}
