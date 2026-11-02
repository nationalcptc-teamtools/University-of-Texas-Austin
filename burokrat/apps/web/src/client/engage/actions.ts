import {
  applyScan,
  BLANK_FINDING,
  inRanges,
  parseRanges,
  type MachineScope,
  type MachineStatus,
  type ScanPlan,
} from "@burokrat/domain";
import { nanoid } from "nanoid";
import { addFinding } from "../finding/actions.ts";
import { unitOf, updateProject, type ProjectSession } from "../project-session.ts";
import { STRUCT } from "../undo-registry.ts";

/** The addresses the rules of engagement exclude, as the team listed them. */
export function excludedRanges(session: ProjectSession) {
  return parseRanges(session.doc.getMap("engage").ensureMergeableText("outOfScope").toString());
}

/**
 * Adds and fills machines as the plan says, new ones with `scope` unless their address is
 * excluded. It is the project's change, not an edit to undo.
 */
export function importScan(
  session: ProjectSession,
  plan: ScanPlan,
  author: string,
  scope: MachineScope,
) {
  const excluded = excludedRanges(session);
  applyScan(session.doc.getMap("machines"), plan, {
    author,
    now: Date.now(),
    newId: nanoid,
    scopeOf: (ip) => (inRanges(ip, excluded) ? "out" : scope),
  });
  session.doc.commit({ origin: "sys:import" });
}

/** Sets the machines' status, each an undoable step of its machine's form. */
export function setStatus(session: ProjectSession, machineIds: string[], status: MachineStatus) {
  for (const machineId of machineIds) {
    updateProject(session, unitOf(machineId, STRUCT), (draft) => {
      draft.machines[machineId]!.status = status;
    });
  }
}

/**
 * Changes who is on the machines, "" for no one, and since when. Claiming an untouched machine
 * starts it. The change is the project's, not undone.
 */
export function claimMachines(session: ProjectSession, machineIds: string[], owner: string) {
  const now = Date.now();
  session.store.setState(
    (draft) => {
      for (const machineId of machineIds) {
        const machine = draft.machines[machineId]!;
        machine.owner = owner;
        machine.claimedAt = owner ? now : 0;
        if (owner && machine.status === "untouched") machine.status = "progress";
      }
    },
    { origin: "sys:claim" },
  );
}

/** Deletes or restores a machine. A deleted one is kept in the doc, so it can be restored. */
export function setMachineDeleted(session: ProjectSession, machineId: string, deleted: boolean) {
  session.store.setState((draft) => void (draft.machines[machineId]!.deleted = deleted), {
    origin: "sys:delete",
  });
}

/** A raw block Typst shows verbatim, fenced longer than any run of backticks in `text`. */
function rawBlock(text: string) {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${text}\n${fence}`;
}

/**
 * Starts a finding that targets the machine, with `notes`, if any, as its exploitation details,
 * and returns its id.
 */
export function makeFinding(
  session: ProjectSession,
  machineId: string,
  notes: string,
  owner: string,
) {
  const exploitDetails = notes.trim() ? rawBlock(notes.trim()) : "";
  return addFinding(session, { ...BLANK_FINDING, exploitDetails }, owner, { [machineId]: {} });
}
