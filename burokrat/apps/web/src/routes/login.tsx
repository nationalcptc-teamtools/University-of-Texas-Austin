import { Banner, Button, Input, LayerCard, Text } from "@cloudflare/kumo";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import { z } from "zod";
import { formString } from "../client/components/ProjectFields.tsx";
import { getSessionFn, loginFn, safeRedirect } from "../auth.ts";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    if (await getSessionFn()) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [name, passcode] = [formString(form, "name"), formString(form, "passcode")];
    setPending(true);
    const result = await loginFn({ data: { name, passcode } });
    setPending(false);
    if (!result.ok) return setError(result.error);
    await router.invalidate();
    await router.navigate({ href: safeRedirect(search.redirect) });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LayerCard render={<form onSubmit={onSubmit} />} className="w-full max-w-sm">
        <LayerCard.Primary className="flex flex-col gap-4 p-6">
          <Text variant="heading" size="lg" as="h1">
            Burokrat
          </Text>
          {error && <Banner variant="error" title={error} />}
          <Input label="Display name" name="name" required maxLength={40} autoComplete="nickname" />
          <Input
            label="Team passcode"
            name="passcode"
            type="password"
            required
            autoComplete="current-password"
          />
          <Button type="submit" variant="primary" loading={pending}>
            Sign in
          </Button>
        </LayerCard.Primary>
      </LayerCard>
    </main>
  );
}
