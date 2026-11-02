import {
  writeCredential,
  type CredentialDraft,
  type CredentialState,
  type ProjectState,
} from "@burokrat/domain";
import { nanoid } from "nanoid";
import { useCallback, useMemo } from "react";
import {
  unitOf,
  updateProject,
  useProjectSession,
  useProjectState,
  type ProjectSession,
} from "../project-session.ts";
import { STRUCT } from "../undo-registry.ts";

export type Credential = CredentialState & { id: string };

/** Every edit to the credentials is one undoable step of their list. */
export const CREDENTIALS_UNIT = unitOf("credentials", STRUCT);

const selectCredentials = (state: ProjectState) => state.credentials;

/** The credentials not deleted, oldest first; only those from or working on `machineId` if given. */
export function useCredentials(machineId?: string): Credential[] {
  const credentials = useProjectState(selectCredentials) as Record<string, CredentialState>;
  return useMemo(
    () =>
      Object.entries(credentials)
        .filter(([, credential]) => !credential.deleted)
        .filter(
          ([, credential]) =>
            !machineId || credential.source === machineId || credential.works[machineId],
        )
        .map(([id, credential]) => ({ ...credential, id }))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    [credentials, machineId],
  );
}

/** Writes to one credential, as one undoable step of the list. */
export function useUpdateCredential() {
  const session = useProjectSession();
  session.undo.get(CREDENTIALS_UNIT);
  return useCallback(
    (credentialId: string, write: (credential: CredentialDraft) => void) =>
      updateProject(session, CREDENTIALS_UNIT, (draft) => write(draft.credentials[credentialId]!)),
    [session],
  );
}

/** Adds a blank password found on `source`, "" for nowhere in particular, and returns its id. */
export function addCredential(session: ProjectSession, author: string, source = "") {
  const id = nanoid();
  writeCredential(session.doc.getMap("credentials"), id, {
    username: "",
    domain: "",
    secret: "",
    type: "password",
    source,
    works: source ? { [source]: true } : {},
    note: "",
    createdBy: author,
    createdAt: Date.now(),
    deleted: false,
  });
  session.doc.commit({ origin: "sys:create" });
  return id;
}
