import { Badge, Button, Select, Text } from "@cloudflare/kumo";
import {
  accountOf,
  CREDENTIAL_LABELS,
  CREDENTIAL_TYPES,
  nxcArguments,
  type CredentialDraft,
} from "@burokrat/domain";
import { CopyIcon, KeyIcon, PlusIcon, TerminalIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { copyText } from "../copy-text.ts";
import { SyncedInput } from "../editors/SyncedInput.tsx";
import { useProjectSession } from "../project-session.ts";
import { undoFormEdits } from "../undo-registry.ts";
import {
  addCredential,
  CREDENTIALS_UNIT,
  useCredentials,
  useUpdateCredential,
  type Credential,
} from "./credentials.ts";
import { machineLabel } from "./links.ts";
import { useMachineList, type Machine } from "./use-machines.ts";

const TYPE_ITEMS = CREDENTIAL_TYPES.map((value) => ({ value, label: CREDENTIAL_LABELS[value] }));

type Props = { userName: string; machineId?: string };

/**
 * The logins the team found, where each came from and what it works on, copied as tools take
 * them. With `machineId`, only those from or working on that machine, and new ones come from it.
 */
export function CredentialList({ userName, machineId }: Props) {
  const session = useProjectSession();
  const credentials = useCredentials(machineId);
  const machines = useMachineList();
  const update = useUpdateCredential();
  const copyAll = (line: (credential: Credential) => string, what: string) => {
    const lines = [...new Set(credentials.map(line).filter(Boolean))];
    void copyText(lines.join("\n"), `${lines.length} ${what}`);
  };

  return (
    <div
      className="@container flex flex-col gap-3"
      onKeyDown={undoFormEdits(session.undo, CREDENTIALS_UNIT)}
    >
      {credentials.length === 0 && <Text variant="secondary">No credentials yet.</Text>}
      {credentials.map((credential) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          machines={machines}
          update={(write) => update(credential.id, write)}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button icon={PlusIcon} onClick={() => addCredential(session, userName, machineId)}>
          Credential
        </Button>
        {!machineId && credentials.length > 0 && (
          <>
            <span className="flex-1" />
            <Button
              variant="ghost"
              icon={CopyIcon}
              onClick={() => copyAll((credential) => credential.username, "usernames")}
            >
              Copy usernames
            </Button>
            <Button
              variant="ghost"
              icon={CopyIcon}
              onClick={() =>
                copyAll(
                  (credential) => (credential.type === "password" ? credential.secret : ""),
                  "passwords",
                )
              }
            >
              Copy passwords
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  credential: Credential;
  machines: Machine[];
  update: (write: (credential: CredentialDraft) => void) => void;
};

function CredentialRow({ credential, machines, update }: RowProps) {
  const { projectId } = useProjectSession();
  const works = machines.filter((machine) => credential.works[machine.id]);
  const untried = machines
    .filter((machine) => !credential.works[machine.id])
    .map((machine) => ({ value: machine.id, label: machineLabel(machine) }));
  const sources = [
    { value: "", label: "Nowhere in particular" },
    ...machines.map((machine) => ({ value: machine.id, label: machineLabel(machine) })),
  ];

  return (
    <div className="flex flex-col gap-2 border-b border-kumo-line pb-3">
      <div className="grid gap-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1.4fr)_8.5rem_auto]">
        <SyncedInput
          aria-label="Username"
          placeholder="Username"
          maxLength={500}
          value={credential.username}
          onChange={(event) => update((draft) => void (draft.username = event.target.value))}
        />
        <SyncedInput
          aria-label="Domain"
          placeholder="Domain"
          maxLength={500}
          value={credential.domain}
          onChange={(event) => update((draft) => void (draft.domain = event.target.value))}
        />
        <SyncedInput
          aria-label="Secret"
          placeholder="Password, hash, ticket or key"
          className="font-mono"
          maxLength={10_000}
          value={credential.secret}
          onChange={(event) => update((draft) => void (draft.secret = event.target.value))}
        />
        <Select
          aria-label="Type"
          value={credential.type}
          items={TYPE_ITEMS}
          onValueChange={(type) => type && update((draft) => void (draft.type = type))}
        />
        <span className="flex">
          <Button
            variant="ghost"
            shape="square"
            icon={TerminalIcon}
            aria-label="Copy netexec arguments"
            title="Copy netexec arguments"
            onClick={() => void copyText(nxcArguments(credential), "netexec arguments")}
          />
          <Button
            variant="ghost"
            shape="square"
            icon={KeyIcon}
            aria-label="Copy account and secret"
            title="Copy account:secret"
            onClick={() =>
              void copyText(`${accountOf(credential)}:${credential.secret}`, "account and secret")
            }
          />
          <Button
            variant="ghost"
            shape="square"
            icon={TrashIcon}
            aria-label="Delete credential"
            onClick={() => update((draft) => void (draft.deleted = true))}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Text variant="secondary">Found on</Text>
        <Select
          aria-label="Found on"
          value={credential.source}
          items={sources}
          onValueChange={(source) => update((draft) => void (draft.source = source ?? ""))}
        />
        <Text variant="secondary">Works on</Text>
        {works.map((machine) => (
          <Badge key={machine.id} variant="neutral">
            <Link
              to="/p/$projectId/engage/m/$machineId"
              params={{ projectId, machineId: machine.id }}
              className="font-mono text-[0.9em] hover:underline"
            >
              {machine.ip}
            </Link>
            <button
              type="button"
              aria-label={`It does not work on ${machineLabel(machine)}`}
              className="ml-1 hover:text-kumo-default"
              onClick={() => update((draft) => void delete draft.works[machine.id])}
            >
              <XIcon size={10} />
            </button>
          </Badge>
        ))}
        {untried.length > 0 && (
          <Select
            aria-label="Add a machine it works on"
            placeholder="Add machine"
            value={null}
            items={untried}
            onValueChange={(machineId) =>
              machineId && update((draft) => void (draft.works[machineId] = true))
            }
          />
        )}
        <SyncedInput
          aria-label="Note"
          placeholder="Note, such as where it was found"
          className="min-w-48 flex-1"
          maxLength={500}
          value={credential.note}
          onChange={(event) => update((draft) => void (draft.note = event.target.value))}
        />
      </div>
    </div>
  );
}
