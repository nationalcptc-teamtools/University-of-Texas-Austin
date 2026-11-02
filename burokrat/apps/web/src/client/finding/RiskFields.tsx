import { Select, Text } from "@cloudflare/kumo";
import {
  IMPACT_DEFINITIONS,
  LEVELS,
  LEVELS_HIGH_FIRST,
  LIKELIHOOD_DEFINITIONS,
  overallRisk,
  type Level,
} from "@burokrat/domain";
import { RiskBadge } from "../components/RiskBadge.tsx";
import type { FindingState } from "@burokrat/domain";
import type { UpdateFinding } from "./use-finding-store.ts";

const LEVEL_ITEMS = LEVELS_HIGH_FIRST.toReversed().map((value) => ({
  label: LEVELS[value],
  value,
}));

type Props = { finding: FindingState; update: UpdateFinding };

export function RiskFields({ finding, update }: Props) {
  const { impact, likelihood } = finding;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <LevelSelect
        label="Impact"
        value={impact}
        description={IMPACT_DEFINITIONS[impact]}
        onChange={(level) => update((draft) => void (draft.impact = level))}
      />
      <LevelSelect
        label="Likelihood"
        value={likelihood}
        description={LIKELIHOOD_DEFINITIONS[likelihood]}
        onChange={(level) => update((draft) => void (draft.likelihood = level))}
      />
      <div className="flex flex-col gap-1.5">
        <Text variant="secondary" size="sm">
          Overall risk
        </Text>
        <RiskBadge risk={overallRisk(impact, likelihood)} />
      </div>
    </div>
  );
}

type LevelSelectProps = {
  label: string;
  value: Level;
  description: string | undefined;
  onChange: (level: Level) => void;
};

function LevelSelect({ label, value, description, onChange }: LevelSelectProps) {
  return (
    <Select
      label={label}
      description={description}
      className="w-48"
      value={value}
      items={LEVEL_ITEMS}
      onValueChange={(next) => next !== null && onChange(next)}
    />
  );
}
