import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { isTyping } from "../../../client/is-typing.ts";
import {
  ImportContext,
  ImportDialog,
  readScan,
  type Scan,
} from "../../../client/engage/ImportDialog.tsx";

export const Route = createFileRoute("/_authed/p/$projectId/engage")({
  component: EngageLayout,
});

/** Every Engage page: pasting a scan or a list of addresses outside a field imports it. */
function EngageLayout() {
  const { session: user } = Route.useRouteContext();
  const [scan, setScan] = useState<Scan>();

  const openImport = useCallback((text: string, source: string) => {
    const read = readScan(text, source);
    setScan(read);
    return read !== undefined;
  }, []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (isTyping(event.target)) return;
      const text = event.clipboardData?.getData("text/plain");
      if (!text?.trim()) return;
      event.preventDefault();
      openImport(text, "the pasted text");
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openImport]);

  return (
    <ImportContext value={openImport}>
      <Outlet />
      <ImportDialog scan={scan} userName={user.name} onClose={() => setScan(undefined)} />
    </ImportContext>
  );
}
