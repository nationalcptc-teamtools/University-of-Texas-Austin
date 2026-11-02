/// <reference types="vite/client" />
import { Toasty } from "@cloudflare/kumo";
import { HeadContent, Outlet, ScriptOnce, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { THEME_SCRIPT } from "../client/theme.ts";
import { toasts } from "../client/toasts.ts";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#ffffff" },
      { title: "Burokrat" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    // Changes made offline are only on this device until they sync, so ask not to have them evicted.
    void navigator.storage?.persist().catch(() => {});
  }, []);
  return (
    <RootDocument>
      <Toasty toastManager={toasts}>
        <Outlet />
      </Toasty>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ScriptOnce>{THEME_SCRIPT}</ScriptOnce>
      </head>
      <body className="bg-kumo-canvas text-kumo-default">
        <div className="isolate min-h-screen">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
