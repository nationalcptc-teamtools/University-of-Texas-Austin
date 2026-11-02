import { Sidebar, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import { ConnectionStatus } from "./ConnectionStatus.tsx";

type Props = { title: ReactNode; children?: ReactNode };

/** A project page's toolbar. It lines up with the project sidebar's header and toggles it. */
export function PageHeader({ title, children }: Props) {
  return (
    <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center gap-2 border-b border-kumo-line bg-kumo-canvas px-3">
      <Sidebar.Trigger />
      <Text variant="heading" as="h1" truncate>
        {title}
      </Text>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ConnectionStatus />
        {children}
      </div>
    </header>
  );
}

/** A toolbar button's label, which narrow screens keep for screen readers only. */
export function ToolbarLabel({ children }: { children: ReactNode }) {
  return <span className="max-sm:sr-only">{children}</span>;
}
