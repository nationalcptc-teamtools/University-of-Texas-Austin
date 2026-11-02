import { BLANK_FINDING } from "@burokrat/domain";
import { FINDING_TEMPLATES } from "@burokrat/domain/finding-templates";
import { findingInput } from "@burokrat/typst/browser";
import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vite-plus/test";
import { PreviewContext } from "./context.ts";
import { TypstPreview } from "./TypstPreview.tsx";

test("the preview draws a finding and jumps to the field being edited", async () => {
  const content = { ...FINDING_TEMPLATES[0]!, images: [] };
  const input = findingInput({ companyName: "Acme", teamName: "Blue" }, content);
  const scroller = createRef<HTMLDivElement>();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const show = (field?: { name: string }) =>
    root.render(
      <PreviewContext value={{ field, scroller }}>
        <div ref={scroller} style={{ width: 400, height: 300, overflowY: "auto" }}>
          <TypstPreview projectId="project" kind="finding" input={input} />
        </div>
      </PreviewContext>,
    );
  const firstPage = () => container.querySelector<HTMLCanvasElement>('canvas[aria-label="Page 1"]');

  show();
  // A canvas is 300 pixels wide until a page is drawn into it.
  await expect.poll(() => firstPage()?.width ?? 0, { timeout: 30_000 }).toBeGreaterThan(300);
  expect(scroller.current!.scrollTop).toBe(0);

  show({ name: "remediation" });
  await expect.poll(() => scroller.current!.scrollTop).toBeGreaterThan(0);
});

test("clicking a word on the page reports its field and offset", async () => {
  const content = { ...BLANK_FINDING, description: "Alpha bravo charlie" };
  const input = findingInput({ companyName: "Acme", teamName: "Blue" }, content);
  const jumps: [string, number][] = [];
  const container = document.createElement("div");
  container.style.width = "600px";
  document.body.append(container);
  createRoot(container).render(
    <PreviewContext value={{ onJump: (field, offset) => jumps.push([field, offset]) }}>
      <TypstPreview projectId="project" kind="finding" input={input} />
    </PreviewContext>,
  );
  const page = () => container.querySelector<HTMLCanvasElement>('canvas[aria-label="Page 1"]');
  await expect.poll(() => page()?.width ?? 0, { timeout: 30_000 }).toBeGreaterThan(300);

  const box = page()!.getBoundingClientRect();
  for (let y = 0; y < 1; y += 0.002) {
    const point = { clientX: box.left + box.width * 0.9, clientY: box.top + box.height * y };
    page()!.dispatchEvent(new MouseEvent("click", { ...point, bubbles: true }));
  }
  expect(new Set(jumps.map(([field]) => field))).toEqual(new Set(["description"]));
  expect(jumps.map(([, offset]) => offset)).toContain("Alpha bravo ".length);
});

test("typing deep in a long field scrolls the preview to the caret", async () => {
  const paragraph = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
  const description = Array.from({ length: 12 }, () => paragraph).join("\n\n");
  const content = { ...BLANK_FINDING, description };
  const input = findingInput({ companyName: "Acme", teamName: "Blue" }, content);
  const scroller = createRef<HTMLDivElement>();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const show = (field?: { name: string; offset?: number }) =>
    root.render(
      <PreviewContext value={{ field, scroller }}>
        <div ref={scroller} style={{ width: 400, height: 300, overflowY: "auto" }}>
          <TypstPreview projectId="project" kind="finding" input={input} />
        </div>
      </PreviewContext>,
    );
  const pages = () => container.querySelectorAll<HTMLCanvasElement>("canvas");

  show();
  await expect.poll(() => pages()[2]?.width ?? 0, { timeout: 30_000 }).toBeGreaterThan(300);
  const third = pages()[2]!.getBoundingClientRect();
  const view = scroller.current!.getBoundingClientRect();

  show({ name: "description", offset: description.length - 5 });
  await expect.poll(() => scroller.current!.scrollTop).toBeGreaterThan(third.top - view.top - 300);
});
