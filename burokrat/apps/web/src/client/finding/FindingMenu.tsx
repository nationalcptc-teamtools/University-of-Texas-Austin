import { Button, DropdownMenu } from "@cloudflare/kumo";
import {
  CopyIcon,
  DotsThreeIcon,
  FileJsIcon,
  FilePdfIcon,
  HandGrabbingIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ComponentProps } from "react";
import { findingJsonUrl, findingPdfUrl } from "../collections.ts";
import { useProjectSession } from "../project-session.ts";
import { useOnline } from "../use-connection.ts";
import { claimFinding, duplicateFinding } from "./actions.ts";
import { DeleteFindingDialog } from "./DeleteFindingDialog.tsx";

type Props = { finding: { id: string; title: string; owner: string }; userName: string };

/** A finding's actions in the sidebar: claim, duplicate, download as PDF or JSON, and delete. */
export function FindingMenu({ finding, userName }: Props) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const online = useOnline();
  const session = useProjectSession();
  const { projectId } = session;

  async function duplicate() {
    const findingId = duplicateFinding(session, finding.id, userName);
    await navigate({ to: "/p/$projectId/f/$findingId", params: { projectId, findingId } });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={DotsThreeIcon}
              aria-label={`Actions for ${finding.title || "Untitled"}`}
              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/finding:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
            />
          }
        />
        <DropdownMenu.Content>
          {finding.owner !== userName && (
            <DropdownMenu.Item
              icon={HandGrabbingIcon}
              onClick={() => claimFinding(session, finding.id, userName)}
            >
              Claim from {finding.owner}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item icon={CopyIcon} onClick={() => void duplicate()}>
            Duplicate
          </DropdownMenu.Item>
          <DownloadItem
            online={online}
            icon={FilePdfIcon}
            href={findingPdfUrl(projectId, finding.id)}
            target="_blank"
          >
            Download PDF
          </DownloadItem>
          <DownloadItem
            online={online}
            icon={FileJsIcon}
            href={findingJsonUrl(projectId, finding.id)}
            download
          >
            Export JSON
          </DownloadItem>
          <DropdownMenu.Separator />
          <DropdownMenu.Item variant="danger" icon={TrashIcon} onClick={() => setDeleting(true)}>
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <DeleteFindingDialog findingId={finding.id} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

type DownloadItemProps = ComponentProps<typeof DropdownMenu.LinkItem> & { online: boolean };

/** A file the server builds; a plain disabled item while offline, as links can't be disabled. */
function DownloadItem({ online, icon, children, ...link }: DownloadItemProps) {
  if (!online) {
    return (
      <DropdownMenu.Item icon={icon} disabled>
        {children}
      </DropdownMenu.Item>
    );
  }
  return (
    <DropdownMenu.LinkItem icon={icon} {...link}>
      {children}
    </DropdownMenu.LinkItem>
  );
}
