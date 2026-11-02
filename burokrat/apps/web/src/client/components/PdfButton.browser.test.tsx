import { Toasty } from "@cloudflare/kumo";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { toasts } from "../toasts.ts";
import { PdfButton } from "./PdfButton.tsx";

test("a PDF the server cannot build shows its errors here, without opening a tab", async () => {
  const errors = "The document could not be generated:\n- Description: unknown variable: nonsense";
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(errors, { status: 500 }));
  const open = vi.spyOn(window, "open");
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <Toasty toastManager={toasts}>
      <PdfButton href="/finding.pdf" disabled={false} />
    </Toasty>,
  );

  await page.getByRole("button", { name: "PDF" }).click();
  await expect.element(page.getByText("The PDF could not be built")).toBeVisible();
  await expect.element(page.getByText(/unknown variable: nonsense/)).toBeVisible();
  expect(open).not.toHaveBeenCalled();
});
