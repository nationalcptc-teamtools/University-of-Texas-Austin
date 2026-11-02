import { Empty, Loader } from "@cloudflare/kumo";
import { useOnline } from "../use-connection.ts";

/** Shown while a doc loads. Offline, only docs this device already has can load. */
export function DocLoading() {
  const online = useOnline();
  if (online) return <Loader />;
  return (
    <Empty
      title="Not available offline"
      description="Open it once while online to keep a copy on this device."
    />
  );
}
