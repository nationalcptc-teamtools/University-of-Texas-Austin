import { LayerCard } from "@cloudflare/kumo";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../../../client/components/PageHeader.tsx";
import { CredentialList } from "../../../../client/engage/CredentialList.tsx";
import { EngageText } from "../../../../client/engage/EngageText.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage/notes")({
  component: NotesPage,
});

/** What the whole team needs at hand: the logins found, and notes that belong to no one machine. */
function NotesPage() {
  const { session: user } = Route.useRouteContext();
  return (
    <>
      <PageHeader title="Credentials and notes" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-5">
        <LayerCard render={<section aria-label="Credentials" />}>
          <LayerCard.Secondary>Credentials</LayerCard.Secondary>
          <LayerCard.Primary className="px-5 py-4">
            <CredentialList userName={user.name} />
          </LayerCard.Primary>
        </LayerCard>
        <LayerCard render={<section aria-label="Team notes" />}>
          <LayerCard.Secondary>Team notes</LayerCard.Secondary>
          <LayerCard.Primary className="px-5 py-4">
            <EngageText
              field="notes"
              userName={user.name}
              label="Notes"
              placeholder="Domain names, attack paths, what the client said, anything not about one machine"
            />
          </LayerCard.Primary>
        </LayerCard>
      </div>
    </>
  );
}
