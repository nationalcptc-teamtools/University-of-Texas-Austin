import { Badge, Tooltip } from "@cloudflare/kumo";
import { CheckIcon, CloudSlashIcon } from "@phosphor-icons/react";
import { useConnection } from "../use-connection.ts";

/** Says when the app is offline, and briefly when it is back. Nothing while all is well. */
export function ConnectionStatus() {
  const connection = useConnection();
  return (
    <span role="status" className="contents">
      {connection === "offline" && (
        <Tooltip
          content="Your changes are saved on this device and sync when you reconnect."
          render={
            <Badge variant="warning" className="gap-1">
              <CloudSlashIcon aria-hidden />
              Offline
            </Badge>
          }
        />
      )}
      {connection === "reconnected" && (
        <Badge variant="success" className="gap-1">
          <CheckIcon aria-hidden />
          Back online
        </Badge>
      )}
    </span>
  );
}
