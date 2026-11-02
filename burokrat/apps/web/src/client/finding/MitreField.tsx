import { Combobox } from "@cloudflare/kumo";
import {
  MITRE_BY_ID,
  MITRE_TECHNIQUES,
  type FindingState,
  type MitreTechnique,
} from "@burokrat/domain";
import type { UpdateFinding } from "./use-finding-store.ts";

type Props = { finding: FindingState; update: UpdateFinding };

const label = (technique: MitreTechnique) => `${technique.id} ${technique.name}`;

export function MitreField({ finding, update }: Props) {
  const selected = Object.keys(finding.mitre)
    .map((id) => MITRE_BY_ID.get(id))
    .filter((technique) => technique !== undefined);

  function onValueChange(next: MitreTechnique[]) {
    const ids = new Set(next.map((technique) => technique.id));
    update((draft) => {
      for (const id of Object.keys(draft.mitre)) if (!ids.has(id)) delete draft.mitre[id];
      for (const id of ids) draft.mitre[id] = true;
    });
  }

  return (
    <Combobox
      label="MITRE ATT&CK techniques"
      multiple
      items={MITRE_TECHNIQUES}
      value={selected}
      onValueChange={onValueChange}
      itemToStringLabel={label}
      isItemEqualToValue={(item: MitreTechnique, value: MitreTechnique) => item.id === value.id}
    >
      <Combobox.TriggerMultipleWithInput
        placeholder="Search techniques"
        renderItem={(technique: MitreTechnique) => (
          <Combobox.Chip key={technique.id}>{label(technique)}</Combobox.Chip>
        )}
      />
      <Combobox.Content className="max-h-72 overflow-y-auto">
        <Combobox.Empty />
        <Combobox.List>
          {(technique: MitreTechnique) => (
            <Combobox.Item key={technique.id} value={technique}>
              {label(technique)}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox>
  );
}
