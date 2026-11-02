import {
  liveMachines,
  type MachineDraft,
  type MachineState,
  type ProjectState,
} from "@burokrat/domain";
import { useCallback, useMemo } from "react";
import { unitOf, updateProject, useProjectSession, useProjectState } from "../project-session.ts";
import { STRUCT } from "../undo-registry.ts";

export type UpdateMachine = (update: (machine: MachineDraft) => void) => void;
export type Machine = MachineState & { id: string };

const selectMachines = (state: ProjectState) => state.machines;

/** A machine's state, or `undefined` if there is no such machine. */
export function useMachine(machineId: string): MachineState | undefined {
  return useProjectState(useCallback((state) => state.machines[machineId], [machineId]));
}

/** The machines not deleted, by IP. */
export function useMachineList(): Machine[] {
  const machines = useProjectState(selectMachines);
  return useMemo(() => liveMachines(machines as Record<string, MachineState>), [machines]);
}

/** Writes to the machine's fields, each write one undoable step of the machine's form. */
export function useUpdateMachine(machineId: string) {
  const session = useProjectSession();
  const unit = unitOf(machineId, STRUCT);
  session.undo.get(unit);
  return useCallback<UpdateMachine>(
    (write) => updateProject(session, unit, (draft) => write(draft.machines[machineId]!)),
    [session, unit, machineId],
  );
}
