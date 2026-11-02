import { BLANK_FINDING } from "@burokrat/domain";
import { findingInput } from "@burokrat/typst/browser";
import { Sidebar } from "@cloudflare/kumo";
import { LoroDoc } from "loro-crdt";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { recordAuthor } from "../history/versions.ts";
import { TypstPreview } from "../preview/TypstPreview.tsx";
import { DocumentPage } from "./DocumentPage.tsx";

test("the preview narrows when the window does", async () => {
  await page.viewport(1600, 900);
  localStorage.setItem("burokrat:preview-width", "900");
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <Sidebar.Provider>
      <DocumentPage title="Finding 1" pdfHref="/finding.pdf" scope={[]} preview={() => null}>
        Editor
      </DocumentPage>
    </Sidebar.Provider>,
  );
  const previewWidth = () =>
    container.querySelector<HTMLElement>("[aria-label='Preview']")?.getBoundingClientRect().width;

  await expect.poll(previewWidth).toBe(900);
  await page.viewport(1000, 900);
  await expect.poll(previewWidth).toBe(360);
});

test("a closed preview still checks the document and shows its errors above the editor", async () => {
  await page.viewport(700, 900);
  const content = { ...BLANK_FINDING, description: "#nonsense" };
  const input = findingInput({ companyName: "Acme", teamName: "Blue" }, content);
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <Sidebar.Provider>
      <DocumentPage
        title="Finding 1"
        pdfHref="/finding.pdf"
        doc={new LoroDoc()}
        scope={[]}
        preview={() => <TypstPreview projectId="project" kind="finding" input={input} />}
      >
        Editor
      </DocumentPage>
    </Sidebar.Provider>,
  );

  await expect
    .element(page.getByText("Fix these Typst errors to export the PDF."), { timeout: 30_000 })
    .toBeVisible();
  await expect.element(page.getByText(/^Description:/)).toBeVisible();
  expect(container.querySelector("canvas")).toBeNull();
});

test("the editors take no cursor while the history shows an earlier version", async () => {
  const doc = new LoroDoc();
  for (const author of ["Alice", "Bob"]) {
    const stop = recordAuthor(doc, author);
    doc.getText("t").insert(0, author);
    doc.commit();
    stop();
  }
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <Sidebar.Provider>
      <DocumentPage
        title="Finding 1"
        pdfHref="/finding.pdf"
        doc={doc}
        scope={[["t"]]}
        preview={() => null}
      >
        <input aria-label="Title" />
      </DocumentPage>
    </Sidebar.Provider>,
  );
  const view = page.elementLocator(container);
  const title = view.getByLabelText("Title");

  await view.getByRole("button", { name: "History" }).click();
  const slider = view.getByRole("slider", { name: "Version" });
  await expect.element(slider).toBeInTheDocument();
  await page.elementLocator(slider.element().parentElement!).click();
  await userEvent.keyboard("{Home}");
  await expect.poll(() => title.element().closest("[inert]")).not.toBeNull();

  await userEvent.keyboard("{End}");
  await expect.poll(() => title.element().closest("[inert]")).toBeNull();
});
