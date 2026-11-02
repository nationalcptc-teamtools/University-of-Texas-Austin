import { Badge, Banner, Tooltip } from "@cloudflare/kumo";
import {
  MACHINE_SCOPES,
  MACHINE_STATUSES,
  SCOPE_LABELS,
  STATUS_LABELS,
  type MachineScope,
  type MachineStatus,
} from "@burokrat/domain";
import type { ComponentProps } from "react";

export const STATUS_VARIANTS: Record<MachineStatus, ComponentProps<typeof Badge>["variant"]> = {
  untouched: "neutral",
  progress: "blue",
  foothold: "orange",
  owned: "green",
  parked: "purple",
};

/** Select items in the order keys 1 to 5 set them. */
export const STATUS_ITEMS = MACHINE_STATUSES.map((value, index) => ({
  value,
  label: `${index + 1} · ${STATUS_LABELS[value]}`,
}));

export const SCOPE_ITEMS = MACHINE_SCOPES.map((value) => ({ value, label: SCOPE_LABELS[value] }));

export function StatusBadge({ status }: { status: MachineStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

type ScopeProps = { scope: MachineScope; note: string };

/** Nothing for an in-scope machine; a warning to be careful, or that it is out of scope, and why. */
export function ScopeBadge({ scope, note }: ScopeProps) {
  if (scope === "in") return null;
  const badge = (
    <Badge variant={scope === "caution" ? "warning" : "neutral"}>{SCOPE_LABELS[scope]}</Badge>
  );
  return note ? (
    <Tooltip content={note} delay={100} render={<span />}>
      {badge}
    </Tooltip>
  ) : (
    badge
  );
}

/** What the rules of engagement say about a machine that is not plainly in scope. */
export function ScopeWarning({ scope, note }: ScopeProps) {
  if (scope === "in") return null;
  const title =
    scope === "caution"
      ? "Be careful on this machine"
      : "This machine is out of scope: leave it alone";
  return (
    <Banner
      variant={scope === "caution" ? "alert" : "error"}
      title={title}
      description={note || undefined}
    />
  );
}
