import { Button, Input, LayerCard, Select, Table, Text } from "@cloudflare/kumo";
import {
  compareServiceKeys,
  MACHINE_STATUSES,
  matchesFilter,
  parseFilter,
  parseServiceKey,
  STATUS_LABELS,
  toggleTerm,
  type MachineFilter,
  type MachineStatus,
} from "@burokrat/domain";
import { CopyIcon, HandGrabbingIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { isTyping } from "../is-typing.ts";
import { useProjectSession } from "../project-session.ts";
import { claimMachines, setStatus } from "./actions.ts";
import { copyTargets } from "./copy-targets.ts";
import { useFindingCounts } from "./links.ts";
import { MachineDrawer } from "./MachineDrawer.tsx";
import { STATUS_ITEMS, StatusBadge, ScopeBadge } from "./StatusBadge.tsx";
import { useMachineList, type Machine } from "./use-machines.ts";

const withoutStatus = (filter: MachineFilter): MachineFilter => ({
  ...filter,
  terms: filter.terms.filter((term) => term.key !== "status"),
});

const portsOf = (machine: Machine) =>
  Object.keys(machine.services)
    .sort(compareServiceKeys)
    .map((key) => parseServiceKey(key).port);

type Props = { userName: string };

/**
 * Every machine, filtered by terms such as `status:foothold port:445 owner:me`. Keys triage the
 * focused row, or the checked ones: J and K move, 1 to 5 set the status, A claims, X checks,
 * Space peeks, Enter opens, and Escape closes the peek, then clears the checks.
 */
export function MachineTable({ userName }: Props) {
  const session = useProjectSession();
  const navigate = useNavigate();
  const machines = useMachineList();
  const findingCounts = useFindingCounts();
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string>();
  const [peeking, setPeeking] = useState(false);
  const filterInput = useRef<HTMLInputElement>(null);

  const filter = useMemo(() => parseFilter(query), [query]);
  const shown = machines.filter((machine) => matchesFilter(machine, filter, userName));
  const facetPool = machines.filter((machine) =>
    matchesFilter(machine, withoutStatus(filter), userName),
  );
  const shownChecked = shown.filter((machine) => checked.has(machine.id));
  const focusedRow = shown.find((machine) => machine.id === focused) ?? shown[0];
  const targets = shownChecked.length > 0 ? shownChecked : focusedRow ? [focusedRow] : [];

  function toggleChecked(machineId: string) {
    const next = new Set(checked);
    if (!next.delete(machineId)) next.add(machineId);
    setChecked(next);
  }

  function claim(machinesToClaim: Machine[]) {
    const mine = machinesToClaim.every((machine) => machine.owner === userName);
    claimMachines(
      session,
      machinesToClaim.map((machine) => machine.id),
      mine ? "" : userName,
    );
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter" || event.key === " ") {
      if (event.target instanceof Element && event.target.closest("button, a, [role]")) return;
    }
    if (event.key === "/") {
      event.preventDefault();
      filterInput.current?.focus();
      return;
    }
    if (event.key === "Escape") {
      if (peeking) setPeeking(false);
      else setChecked(new Set());
      return;
    }
    if (!focusedRow) return;
    const index = shown.indexOf(focusedRow);
    const status = MACHINE_STATUSES[Number(event.key) - 1];
    if (event.key === "j" || event.key === "ArrowDown")
      setFocused(shown[Math.min(index + 1, shown.length - 1)]!.id);
    else if (event.key === "k" || event.key === "ArrowUp")
      setFocused(shown[Math.max(index - 1, 0)]!.id);
    else if (status)
      setStatus(
        session,
        targets.map((machine) => machine.id),
        status,
      );
    else if (event.key === "a") claim(targets);
    else if (event.key === "x") toggleChecked(focusedRow.id);
    else if (event.key === " ") setPeeking(!peeking);
    else if (event.key === "Enter")
      void navigate({
        to: "/p/$projectId/engage/m/$machineId",
        params: { projectId: session.projectId, machineId: focusedRow.id },
      });
    else return;
    event.preventDefault();
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isTyping(event.target)) onKey(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (focusedRow)
      document.getElementById(`machine-${focusedRow.id}`)?.scrollIntoView({ block: "nearest" });
  }, [focusedRow]);

  const allChecked = shown.length > 0 && shownChecked.length === shown.length;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        <Input
          ref={filterInput}
          aria-label="Filter machines"
          placeholder="Filter: status:foothold port:445 owner:me os:windows, or any text"
          className="font-mono"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && event.currentTarget.blur()}
        />
        <div className="flex flex-wrap items-center gap-2">
          {MACHINE_STATUSES.map((status) => (
            <FacetButton
              key={status}
              label={STATUS_LABELS[status]}
              count={facetPool.filter((machine) => machine.status === status).length}
              pressed={filter.terms.some((term) => term.key === "status" && term.value === status)}
              onClick={() => setQuery(toggleTerm(query, "status", status))}
            />
          ))}
          <FacetButton
            label="Mine"
            count={facetPool.filter((machine) => machine.owner === userName).length}
            pressed={filter.terms.some((term) => term.key === "owner" && term.value === "me")}
            onClick={() => setQuery(toggleTerm(query, "owner", "me"))}
          />
          <span className="flex-1" />
          <BulkActions
            machines={shownChecked}
            onStatus={(status) =>
              setStatus(
                session,
                shownChecked.map((machine) => machine.id),
                status,
              )
            }
            onClaim={() => claim(shownChecked)}
          />
          <Button
            size="sm"
            icon={CopyIcon}
            disabled={shown.length === 0}
            onClick={() => {
              const copied = shownChecked.length > 0 ? shownChecked : shown;
              void copyTargets(
                copied.map((machine) => ({ machine, line: machine.ip })),
                "IPs",
              );
            }}
          >
            Copy IPs
          </Button>
        </div>
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.CheckHead
                  checked={allChecked}
                  indeterminate={shownChecked.length > 0 && !allChecked}
                  onCheckedChange={() =>
                    setChecked(allChecked ? new Set() : new Set(shown.map((machine) => machine.id)))
                  }
                />
                <Table.Head>IP</Table.Head>
                <Table.Head>Hostname</Table.Head>
                <Table.Head>OS</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Ports</Table.Head>
                <Table.Head>Owner</Table.Head>
                <Table.Head>Findings</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shown.map((machine) => (
                <Table.Row
                  key={machine.id}
                  id={`machine-${machine.id}`}
                  variant={checked.has(machine.id) ? "selected" : "default"}
                  className={
                    machine.id === focusedRow?.id
                      ? "outline-2 -outline-offset-2 outline-kumo-brand"
                      : ""
                  }
                  onClick={() => setFocused(machine.id)}
                >
                  <Table.CheckCell
                    checked={checked.has(machine.id)}
                    onCheckedChange={() => toggleChecked(machine.id)}
                  />
                  <Table.Cell className="font-mono text-[0.9em]">
                    <Link
                      to="/p/$projectId/engage/m/$machineId"
                      params={{ projectId: session.projectId, machineId: machine.id }}
                      className="text-kumo-link hover:underline"
                    >
                      {machine.ip || "No IP"}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{machine.hostname}</Table.Cell>
                  <Table.Cell className="max-w-48 truncate">{machine.os}</Table.Cell>
                  <Table.Cell>
                    <span className="flex gap-1">
                      <StatusBadge status={machine.status} />
                      <ScopeBadge scope={machine.scope} note={machine.scopeNote} />
                    </span>
                  </Table.Cell>
                  <Table.Cell className="max-w-56 truncate font-mono text-[0.9em]">
                    {portsOf(machine).join(", ")}
                  </Table.Cell>
                  <Table.Cell>{machine.owner}</Table.Cell>
                  <Table.Cell>{findingCounts.get(machine.id) || ""}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {shown.length === 0 && (
            <Text variant="secondary" DANGEROUS_className="block px-4 py-3">
              {machines.length === 0 ? "No machines yet." : "No machines match the filter."}
            </Text>
          )}
        </LayerCard>
        <Text variant="secondary" size="xs">
          J K move · 1–5 status · A claim · X check · Space peek · Enter open · / filter
        </Text>
      </div>
      <MachineDrawer
        machineId={focusedRow?.id}
        open={peeking && !!focusedRow}
        userName={userName}
        onClose={() => setPeeking(false)}
      />
    </>
  );
}

type FacetProps = { label: string; count: number; pressed: boolean; onClick: () => void };

function FacetButton({ label, count, pressed, onClick }: FacetProps) {
  return (
    <Button
      size="sm"
      variant={pressed ? "primary" : "secondary"}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {label} <span className="opacity-70">{count}</span>
    </Button>
  );
}

type BulkProps = {
  machines: Machine[];
  onStatus: (status: MachineStatus) => void;
  onClaim: () => void;
};

/** Status and claim for the checked machines. */
function BulkActions({ machines, onStatus, onClaim }: BulkProps) {
  if (machines.length === 0) return null;
  return (
    <>
      <Text variant="secondary">{machines.length} checked</Text>
      <Select
        aria-label="Set status"
        placeholder="Set status"
        value={null}
        items={STATUS_ITEMS}
        onValueChange={(status) => status && onStatus(status)}
      />
      <Button size="sm" icon={HandGrabbingIcon} onClick={onClaim}>
        Claim
      </Button>
    </>
  );
}
