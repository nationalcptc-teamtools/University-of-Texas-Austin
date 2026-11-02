import { Button } from "@cloudflare/kumo";
import { EditorView } from "@codemirror/view";
import { NotePencilIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import type { LoroMap } from "loro-crdt";
import { useCallback, useRef } from "react";
import { MarkupEditor } from "../editors/MarkupEditor.tsx";
import { addFiles } from "../files.ts";
import { unitOf, useProjectSession } from "../project-session.ts";
import { makeFinding } from "./actions.ts";

type Props = { machineId: string; userName: string };

/**
 * The team's shared notes on the machine. A pasted screenshot becomes one of the machine's files,
 * and the selected lines can start a finding.
 */
export function MachineNotes({ machineId, userName }: Props) {
  const session = useProjectSession();
  const navigate = useNavigate();
  const editor = useRef<HTMLDivElement>(null);
  const root = session.doc.getMap("machines").get(machineId) as LoroMap;
  const getNotes = useCallback(() => root.ensureMergeableText("notes"), [root]);

  async function attach(file: File) {
    await addFiles(session, [file], userName, [machineId]);
    return undefined;
  }

  async function startFinding() {
    const element = editor.current?.querySelector<HTMLElement>(".cm-editor");
    const view = element && EditorView.findFromDOM(element);
    const selected = view
      ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
      : "";
    const findingId = makeFinding(session, machineId, selected, userName);
    const { projectId } = session;
    await navigate({ to: "/p/$projectId/f/$findingId", params: { projectId, findingId } });
  }

  return (
    <div ref={editor} className="flex flex-col gap-2">
      <MarkupEditor
        session={session}
        unit={unitOf(machineId, "notes")}
        getText={getNotes}
        userName={userName}
        label="Notes"
        placeholder="Scan output, credentials found, what worked and what didn't"
        plain
        onPasteImage={attach}
      />
      <Button
        icon={NotePencilIcon}
        className="self-end"
        title="Starts a finding on this machine, with the selected notes as its exploitation details"
        onClick={() => void startFinding()}
      >
        Make finding
      </Button>
    </div>
  );
}
