import { Tooltip } from "@cloudflare/kumo";
import { presenceClass } from "../presence.ts";
import { useViewersOf } from "../use-project-presence.ts";

const letters = new Intl.Segmenter();

export function initial(name: string) {
  const [first] = letters.segment(name.trim());
  return first?.segment.toUpperCase() ?? "?";
}

/** The others on this page, as circles with their initial. */
export function PageViewers() {
  const viewers = useViewersOf();
  if (viewers.length === 0) return null;
  return (
    <ul aria-label="Also here" className="flex -space-x-1.5">
      {viewers.map((name) => (
        <Tooltip
          key={name}
          content={name}
          delay={100}
          render={
            <li
              className={`${presenceClass(name)} flex size-7 items-center justify-center rounded-full bg-(--presence) text-xs font-medium text-(--presence-ink,white) ring-2 ring-kumo-canvas`}
            />
          }
        >
          <span aria-hidden>{initial(name)}</span>
          <span className="sr-only">{name}</span>
        </Tooltip>
      ))}
    </ul>
  );
}
