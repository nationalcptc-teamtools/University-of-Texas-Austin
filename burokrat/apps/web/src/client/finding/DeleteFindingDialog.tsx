import { Button, Dialog } from "@cloudflare/kumo";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useProjectSession } from "../project-session.ts";
import { setDeleted } from "./actions.ts";

type Props = {
  findingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Leaves the finding first when it is the one shown, so its editor is not removed underneath. */
export function DeleteFindingDialog({ findingId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const session = useProjectSession();
  const shownId = useParams({ strict: false }).findingId;

  async function remove() {
    onOpenChange(false);
    if (shownId === findingId) {
      await navigate({ to: "/p/$projectId", params: { projectId: session.projectId } });
    }
    setDeleted(session, findingId, true);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="p-6">
        <Dialog.Title className="mb-2 text-lg font-semibold">Delete this finding?</Dialog.Title>
        <Dialog.Description className="mb-4 text-kumo-subtle">
          It is removed for everyone.
        </Dialog.Description>
        <div className="flex justify-end gap-2">
          <Dialog.Close render={(props) => <Button {...props}>Cancel</Button>} />
          <Button variant="destructive" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
