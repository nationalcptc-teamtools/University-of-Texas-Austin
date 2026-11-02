import { Button, Slider, Text } from "@cloudflare/kumo";
import { XIcon } from "@phosphor-icons/react";
import type { Frontiers, LoroDoc } from "loro-crdt";
import { useEffect, useRef, useState } from "react";
import { useThrottled } from "../use-throttled.ts";
import { restoreScope, versionsOf, type Scope, type Version } from "./versions.ts";

/** How long the slider rests before the preview shows that version. */
const SETTLE_MS = 150;

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function useVersions(doc: LoroDoc, scope: Scope) {
  const [versions, setVersions] = useState(() => versionsOf(doc, scope));
  useEffect(() => doc.subscribe(() => setVersions(versionsOf(doc, scope))), [doc, scope]);
  return versions;
}

type Props = {
  doc: LoroDoc;
  /** The part of the doc the page edits: its versions are listed, and only it is restored. */
  scope: Scope;
  /** Called with a read-only copy of the doc at the chosen version, or `undefined` for now. */
  onShow: (past: LoroDoc | undefined) => void;
  onClose: () => void;
};

/**
 * A slider through the versions of the page's part of the doc, which the preview follows, and a
 * button to restore one.
 */
export function HistoryBar({ doc, scope, onShow, onClose }: Props) {
  const versions = useVersions(doc, scope);
  const [chosen, setChosen] = useState<number>();
  const last = versions.length - 1;
  const index = Math.min(chosen ?? last, last);
  const version = versions[index]!;
  const settled = Math.min(useThrottled(index, SETTLE_MS), last);
  // A string, so the preview is not forked again each time the history grows.
  const shown = settled === last ? undefined : JSON.stringify(versions[settled]!.frontiers);
  const show = useRef(onShow);

  useEffect(() => {
    show.current = onShow;
  });

  useEffect(() => {
    show.current(shown === undefined ? undefined : doc.forkAt(JSON.parse(shown) as Frontiers));
  }, [doc, shown]);

  useEffect(() => () => show.current(undefined), []);

  function restore() {
    restoreScope(doc, version.frontiers, scope);
    doc.commit({ origin: "sys:restore" });
    setChosen(undefined);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b select-none border-kumo-line bg-kumo-elevated px-4 py-3">
      <div className="min-w-60 flex-1">
        <Slider
          size="sm"
          label={<VersionLabel version={version} current={index === last} />}
          getAriaLabel={() => "Version"}
          min={1}
          max={versions.length}
          value={index + 1}
          disabled={versions.length < 2}
          onValueChange={(value) => {
            const next = Number(value) - 1;
            setChosen(next === last ? undefined : next);
          }}
        />
      </div>
      <Button variant="primary" disabled={index === last} onClick={restore}>
        Restore this version
      </Button>
      <Button
        variant="ghost"
        shape="square"
        icon={XIcon}
        aria-label="Close history"
        onClick={onClose}
      />
    </div>
  );
}

function VersionLabel({ version, current }: { version: Version; current: boolean }) {
  return (
    <>
      {version.author || "Earlier edits"}
      <Text variant="secondary" as="span" size="sm">
        {version.time > 0 && ` · ${when.format(version.time)}`}
        {current && " · current"}
      </Text>
    </>
  );
}
