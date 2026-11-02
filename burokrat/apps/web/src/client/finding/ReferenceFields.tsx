import { Button } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import type { FindingDraft, FindingState } from "@burokrat/domain";
import { MoveButtons } from "../components/MoveButtons.tsx";
import type { UpdateFinding } from "./use-finding-store.ts";
import { SyncedInput } from "../editors/SyncedInput.tsx";

type Props = { finding: FindingState; update: UpdateFinding };

export function ReferenceFields({ finding, update }: Props) {
  const references = finding.references;
  const updateList = (write: (list: FindingDraft["references"]) => void) =>
    update((draft) => write(draft.references));
  return (
    <div className="flex flex-col gap-2">
      {references.map((reference, index) => (
        <div key={reference.$cid} className="flex items-center gap-2">
          <SyncedInput
            aria-label="Name"
            placeholder="Name"
            className="w-64"
            value={reference.name}
            maxLength={500}
            onChange={(event) =>
              updateList((list) => void (list[index]!.name = event.target.value))
            }
          />
          <SyncedInput
            aria-label="URL"
            placeholder="https://"
            type="url"
            className="min-w-0 flex-1"
            value={reference.url}
            maxLength={2000}
            onChange={(event) => updateList((list) => void (list[index]!.url = event.target.value))}
          />
          <MoveButtons
            index={index}
            count={references.length}
            label="reference"
            update={updateList}
          />
        </div>
      ))}
      <div>
        <Button
          icon={PlusIcon}
          onClick={() => updateList((list) => void list.push({ name: "", url: "" }))}
        >
          Reference
        </Button>
      </div>
    </div>
  );
}
