import { Button, LayerCard, Text } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { projectsCollection } from "../../client/collections.ts";
import { ProjectFields, readProjectFields } from "../../client/components/ProjectFields.tsx";
import { UserMenu } from "../../client/components/UserMenu.tsx";
import { useOnline } from "../../client/use-connection.ts";
import { createProjectFn, importProjectFn } from "../../projects.ts";

export const Route = createFileRoute("/_authed/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { session } = Route.useRouteContext();

  return (
    <>
      <header className="flex h-[58px] items-center justify-between border-b border-kumo-line px-4">
        <Text variant="heading" as="span">
          Burokrat
        </Text>
        <UserMenu name={session.name} />
      </header>
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <Text variant="heading" size="lg" as="h1">
            Set up the engagement
          </Text>
        </div>
        <LayerCard>
          <LayerCard.Primary className="px-5 py-4">
            <ProjectForm />
          </LayerCard.Primary>
        </LayerCard>
        <ImportProjectButton />
      </main>
    </>
  );
}

function ProjectForm() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const online = useOnline();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = readProjectFields(new FormData(event.currentTarget));
    setPending(true);
    try {
      const project = await createProjectFn({ data: fields });
      await projectsCollection.utils.writeUpsert(project);
      await navigate({ to: "/p/$projectId", params: { projectId: project.id } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <ProjectFields autoFocus />
      <Button
        type="submit"
        variant="primary"
        loading={pending}
        disabled={!online}
        className="self-end"
      >
        Create
      </Button>
    </form>
  );
}

function ImportProjectButton() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const online = useOnline();

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    setPending(true);
    setError("");
    try {
      const project = await importProjectFn({ data });
      await projectsCollection.utils.writeUpsert(project);
      await navigate({ to: "/p/$projectId", params: { projectId: project.id } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="ghost"
        icon={UploadSimpleIcon}
        loading={pending}
        disabled={!online}
        onClick={() => input.current?.click()}
      >
        Restore from an export
      </Button>
      <input ref={input} type="file" accept=".zip" hidden onChange={onChange} />
      {error && <Text variant="error">{error}</Text>}
    </div>
  );
}
