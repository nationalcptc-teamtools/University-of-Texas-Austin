import { Button } from "@cloudflare/kumo";
import { FilePdfIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toasts } from "../toasts.ts";
import { ToolbarLabel } from "./PageHeader.tsx";

function download(href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = "";
  link.click();
}

/**
 * Builds the PDF on the server first, so its errors show here rather than in a new tab. The tab
 * then opens the same URL, which the browser revalidates against the copy it just fetched; if
 * the tab is blocked, the PDF is downloaded instead.
 */
export function PdfButton({ href, disabled }: { href: string; disabled: boolean }) {
  const [building, setBuilding] = useState(false);

  async function exportPdf() {
    setBuilding(true);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(await response.text());
      await response.blob();
      if (!window.open(href, "_blank")) download(href);
    } catch (error) {
      toasts.add({
        title: "The PDF could not be built",
        description: <span className="whitespace-pre-line">{(error as Error).message}</span>,
        variant: "error",
      });
    } finally {
      setBuilding(false);
    }
  }

  return (
    <Button
      variant="secondary"
      icon={FilePdfIcon}
      loading={building}
      disabled={disabled}
      onClick={() => void exportPdf()}
    >
      <ToolbarLabel>PDF</ToolbarLabel>
    </Button>
  );
}
