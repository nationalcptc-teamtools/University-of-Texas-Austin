import { Button } from "@cloudflare/kumo";
import { HandGrabbingIcon } from "@phosphor-icons/react";
import { ToolbarLabel } from "../components/PageHeader.tsx";
import { useProjectSession } from "../project-session.ts";
import { claimFinding } from "./actions.ts";

type Props = { findingId: string; owner: string; userName: string };

/** Who owns the finding, and a button to claim it when that is someone else. */
export function FindingOwner({ findingId, owner, userName }: Props) {
  const session = useProjectSession();
  if (owner === userName) {
    return <span className="text-kumo-subtle max-md:hidden">Owned by you</span>;
  }
  return (
    <>
      <span className="truncate text-kumo-subtle max-md:hidden">Owned by {owner}</span>
      <Button
        variant="secondary"
        icon={HandGrabbingIcon}
        aria-label={`Claim from ${owner}`}
        onClick={() => claimFinding(session, findingId, userName)}
      >
        <ToolbarLabel>Claim</ToolbarLabel>
      </Button>
    </>
  );
}
