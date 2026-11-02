import { Tooltip } from "@cloudflare/kumo";
import { presenceClass } from "../presence.ts";
import { useViewersOf } from "../use-project-presence.ts";

/** A dot in each other viewer's colour, for a sidebar link to `href`. */
export function ViewerDots({ href }: { href: string }) {
  return useViewersOf(href).map((name) => (
    <Tooltip
      key={name}
      content={name}
      delay={100}
      render={
        <span className={`${presenceClass(name)} size-2 shrink-0 rounded-full bg-(--presence)`} />
      }
    >
      <span className="sr-only">{name}</span>
    </Tooltip>
  ));
}
