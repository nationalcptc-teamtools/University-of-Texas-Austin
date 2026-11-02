import { Button, InlineCopyText, Radio, Text, Tooltip } from "@cloudflare/kumo";
import {
  CVSS_METRIC_KEYS,
  CVSS_METRICS,
  scoreCvss,
  type CvssMetric,
  type CvssMetrics,
  type FindingState,
} from "@burokrat/domain";
import { InfoIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { CVSS_HELP } from "./cvss-help.ts";
import type { UpdateFinding } from "./use-finding-store.ts";

type Group = { title: string; metrics: [CvssMetric, string][] };

/** The base metrics as CVSS 4.0 groups them, each named within its group. */
const EXPLOITABILITY: Group = {
  title: "Exploitability",
  metrics: [
    ["AV", "Attack vector"],
    ["AC", "Attack complexity"],
    ["AT", "Attack requirements"],
    ["PR", "Privileges required"],
    ["UI", "User interaction"],
  ],
};
const IMPACT: Group[] = [
  {
    title: "Vulnerable system impact",
    metrics: [
      ["VC", "Confidentiality"],
      ["VI", "Integrity"],
      ["VA", "Availability"],
    ],
  },
  {
    title: "Subsequent system impact",
    metrics: [
      ["SC", "Confidentiality"],
      ["SI", "Integrity"],
      ["SA", "Availability"],
    ],
  },
];

type Props = { finding: FindingState; update: UpdateFinding };

export function CvssFields({ finding, update }: Props) {
  const groupProps = { finding, update };
  return (
    <div className="@container flex flex-col gap-5">
      <Score metrics={finding.cvss} />
      <MetricGroup group={EXPLOITABILITY} labelWidth="w-44" {...groupProps} />
      <div className="grid gap-5 @[42rem]:grid-cols-2">
        {IMPACT.map((group) => (
          <MetricGroup key={group.title} group={group} labelWidth="w-36" {...groupProps} />
        ))}
      </div>
    </div>
  );
}

function Score({ metrics }: { metrics: CvssMetrics }) {
  const score = scoreCvss(metrics);
  const unset = CVSS_METRIC_KEYS.filter((key) => !metrics[key]).length;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-kumo-line pb-4">
      {score ? (
        <>
          <span className="text-2xl font-semibold tabular-nums">{score.score.toFixed(1)}</span>
          <InlineCopyText>{score.vector}</InlineCopyText>
        </>
      ) : (
        <Text variant="secondary">
          Set every metric to get a score; {unset} {unset === 1 ? "is" : "are"} left.
        </Text>
      )}
    </div>
  );
}

type MetricGroupProps = Props & { group: Group; labelWidth: string };

function MetricGroup({ group, labelWidth, finding, update }: MetricGroupProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2.5">
      <Text as="h3" id={titleId} variant="secondary" bold>
        {group.title}
      </Text>
      {group.metrics.map(([key, label]) => (
        <Radio.Group
          key={key}
          appearance="segmented"
          className="items-start gap-1.5 @[30rem]:flex-row @[30rem]:items-center @[30rem]:gap-3"
          value={finding.cvss[key] ?? ""}
          onValueChange={(value) => update((draft) => void (draft.cvss[key] = String(value)))}
        >
          <Radio.Legend className={`${labelWidth} shrink-0 font-normal`}>
            <MetricName metric={key} label={label} unset={!finding.cvss[key]} />
          </Radio.Legend>
          {Object.entries(CVSS_METRICS[key].values).map(([value, valueLabel]) => (
            <Radio.Item key={value} value={value} label={valueLabel} />
          ))}
        </Radio.Group>
      ))}
    </section>
  );
}

type MetricNameProps = { metric: CvssMetric; label: string; unset: boolean };

function MetricName({ metric, label, unset }: MetricNameProps) {
  const { name, values } = CVSS_METRICS[metric];
  const help = CVSS_HELP[metric];
  return (
    <span className="flex items-center gap-1">
      <span>
        {label}
        {unset && (
          <span aria-hidden className="text-kumo-danger">
            *
          </span>
        )}
      </span>
      <Tooltip
        side="right"
        delay={100}
        content={
          <div className="flex max-w-72 flex-col gap-1.5">
            <p>{help.about}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              {Object.entries(values).map(([value, valueLabel]) => (
                <div key={value} className="contents">
                  <dt className="font-medium">{valueLabel}</dt>
                  <dd>{help.values[value]}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
        render={
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            icon={InfoIcon}
            aria-label={`About ${name}`}
          />
        }
      />
    </span>
  );
}
