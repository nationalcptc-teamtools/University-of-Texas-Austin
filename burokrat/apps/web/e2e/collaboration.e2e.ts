import { expect, test, type Browser, type Page } from "@playwright/test";
import { PASSCODE } from "./env.ts";

async function signIn(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Team passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

async function createProject(page: Page, name: string) {
  await page.goto("/setup");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Company").fill("Acme");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/p\/[^/]+$/);
}

const sidebar = (page: Page) => page.locator("aside").first();
const description = (page: Page) => page.getByRole("textbox", { name: "Description" });

test("two collaborators edit one finding and see each other", async ({ browser }) => {
  const alice = await signIn(browser, "Alice");
  const bob = await signIn(browser, "Bob");

  await createProject(alice, "Shared engagement");
  await bob.goto(alice.url());

  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.waitForURL(/\/f\//);
  await sidebar(bob)
    .getByRole("link", { name: /Untitled/ })
    .click();
  await bob.waitForURL(alice.url());

  await alice.getByLabel("Title", { exact: true }).fill("SQL injection in login");
  await description(bob).click();
  await bob.keyboard.type("Found by Bob.");

  await expect(bob.getByLabel("Title", { exact: true })).toHaveValue("SQL injection in login");
  await expect(description(alice)).toHaveText("Found by Bob.");
  await expect(sidebar(bob).getByRole("link", { name: /SQL injection in login/ })).toBeVisible();
  const aliceRow = sidebar(bob).getByRole("link", { name: "SQL injection in login Alice" });
  await aliceRow.hover();
  const aliceDot = aliceRow.locator(".rounded-full");
  await aliceDot.hover();
  await expect(aliceDot).toHaveAttribute("data-popup-open");
  await expect(bob.getByRole("list", { name: "Also here" })).toHaveText("AAlice");

  await expect(alice.getByRole("img", { name: "Page 1" })).toBeVisible();
  const pdf = await alice.request.get(
    alice.url().replace("/p/", "/api/p/").replace("/f/", "/findings/") + ".pdf",
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

test("an exported project imports as a copy", async ({ browser }) => {
  const alice = await signIn(browser, "Alice");
  await createProject(alice, "Original");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.getByLabel("Title", { exact: true }).fill("Exported finding");
  await expect(sidebar(alice).getByRole("link", { name: /Exported finding/ })).toBeVisible();

  const projectApi = alice
    .url()
    .replace(/\/f\/.*$/, "")
    .replace("/p/", "/api/p/");
  const zip = await alice.request.get(`${projectApi}/export.zip`);
  expect(zip.ok()).toBe(true);

  const bob = await signIn(browser, "Bob");
  await bob.goto("/setup");
  await bob.locator('input[type="file"]').setInputFiles({
    name: "export.zip",
    mimeType: "application/zip",
    buffer: await zip.body(),
  });
  await bob.waitForURL(/\/p\/[^/]+$/);
  expect(bob.url()).not.toContain(projectApi.replace("/api", ""));
  await expect(sidebar(bob).getByRole("link", { name: /Exported finding/ })).toBeVisible();

  const imported = bob.url();
  await bob.goto("/");
  await bob.waitForURL(imported);
});

test("the sidebar menu duplicates and deletes a finding", async ({ browser }) => {
  const alice = await signIn(browser, "Alice");
  await createProject(alice, "Menu");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await description(alice).click();
  await alice.keyboard.type("Kept in the copy.");
  await alice.getByLabel("Title", { exact: true }).fill("Original finding");
  await expect(sidebar(alice).getByRole("link", { name: /Original finding/ })).toBeVisible();

  await sidebar(alice).getByRole("button", { name: "Actions for Original finding" }).click();
  const json = await alice.getByRole("menuitem", { name: "Export JSON" }).getAttribute("href");
  const exported = await alice.request.get(json!);
  expect(await exported.json()).toMatchObject({ title: "Original finding" });
  await alice.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(alice.getByLabel("Title", { exact: true })).toHaveValue("Original finding (copy)");
  await expect(description(alice)).toHaveText("Kept in the copy.");

  await sidebar(alice).getByRole("button", { name: "Actions for Original finding (copy)" }).click();
  await alice.getByRole("menuitem", { name: "Delete" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await alice.waitForURL(/\/p\/[^/]+$/);
  await expect(sidebar(alice).getByRole("link", { name: /\(copy\)/ })).toHaveCount(0);
  await expect(sidebar(alice).getByRole("link", { name: /Original finding/ })).toBeVisible();
});

test("a downloaded finding dropped on the sidebar is added", async ({ browser }) => {
  const alice = await signIn(browser, "Alice");
  await createProject(alice, "Dropped engagement");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.waitForURL(/\/f\//);
  await alice.getByLabel("Title", { exact: true }).fill("Downloaded finding");
  const original = alice.url();
  const jsonUrl = original.replace("/p/", "/api/p/").replace("/f/", "/findings/") + ".json";
  let json = "";
  await expect
    .poll(async () => (json = await (await alice.request.get(jsonUrl)).text()))
    .toContain("Downloaded finding");

  const dataTransfer = await alice.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], "finding.json", { type: "application/json" }));
    return transfer;
  }, json);
  await sidebar(alice)
    .getByRole("heading", { name: "All findings" })
    .dispatchEvent("drop", { dataTransfer });

  await expect(sidebar(alice).getByRole("link", { name: /Downloaded finding/ })).toHaveCount(2);
  await expect(alice).not.toHaveURL(original);
});

test("a collaborator claims a finding and the sidebar filters by owner", async ({ browser }) => {
  const alice = await signIn(browser, "Alice");
  const bob = await signIn(browser, "Bob");
  await createProject(alice, "Ownership");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.waitForURL(/\/f\//);
  await alice.getByLabel("Title", { exact: true }).fill("Open redirect");
  await expect(alice.getByText("Owned by you")).toBeVisible();

  await bob.goto(alice.url());
  await expect(bob.getByText("Owned by Alice")).toBeVisible();
  await bob.getByRole("button", { name: "Claim from Alice" }).click();
  await expect(bob.getByText("Owned by you")).toBeVisible();
  await expect(alice.getByText("Owned by Bob")).toBeVisible();

  const filter = sidebar(alice).getByRole("button", { name: "Filter by owner" });
  await filter.click();
  await alice.getByRole("menuitemradio", { name: "You" }).click();
  await expect(sidebar(alice).getByRole("heading", { name: "Your findings" })).toBeVisible();
  await expect(sidebar(alice).getByRole("link", { name: /Open redirect/ })).toHaveCount(0);
  await filter.click();
  await alice.getByRole("menuitemradio", { name: "Bob" }).click();
  await expect(sidebar(alice).getByRole("link", { name: /Open redirect/ })).toBeVisible();

  await sidebar(alice).getByRole("button", { name: "Actions for Open redirect" }).click();
  await alice.getByRole("menuitem", { name: "Claim from Bob" }).click();
  await expect(alice.getByText("Owned by you")).toBeVisible();
  await expect(bob.getByText("Owned by Alice")).toBeVisible();
  await expect(sidebar(alice).getByRole("heading", { name: "All findings" })).toBeVisible();
});

test("edits and findings made offline stay on the device and sync when the connection returns", async ({
  browser,
}) => {
  const alice = await signIn(browser, "Alice");
  const bob = await signIn(browser, "Bob");
  await createProject(alice, "Offline engagement");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.waitForURL(/\/f\//);
  await alice.waitForFunction(() => navigator.serviceWorker.controller);
  await bob.goto(alice.url());
  await expect(description(bob)).toBeVisible();

  await alice.context().setOffline(true);
  await expect(alice.getByRole("status")).toHaveText("Offline");
  await description(alice).click();
  await alice.keyboard.type("Written on the train.");
  await alice.reload();
  await expect(description(alice)).toHaveText("Written on the train.");
  await expect(alice.getByRole("status")).toHaveText("Offline");
  await expect(description(bob)).toHaveText("");

  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.getByLabel("Title", { exact: true }).fill("Found offline");
  await alice.reload();
  await expect(sidebar(alice).getByRole("link", { name: /Found offline/ })).toBeVisible();
  await expect(alice.getByText("Offline", { exact: true })).toBeVisible();

  await alice.context().setOffline(false);
  await expect(alice.getByText("Back online")).toBeVisible();
  await expect(description(bob)).toHaveText("Written on the train.");
  await expect(sidebar(bob).getByRole("link", { name: /Found offline/ })).toBeVisible();
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const findingImage = (page: Page) => page.locator('main img[src*="/assets/"]');
const loaded = (page: Page) =>
  findingImage(page).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth);

test("an image added offline shows at once and uploads when the connection returns", async ({
  browser,
}) => {
  const alice = await signIn(browser, "Alice");
  const bob = await signIn(browser, "Bob");
  await createProject(alice, "Image engagement");
  await alice.getByRole("button", { name: "New finding" }).click();
  await alice.getByRole("menuitem", { name: "Blank finding" }).click();
  await alice.waitForURL(/\/f\//);
  await alice.waitForFunction(() => navigator.serviceWorker.controller);
  await bob.goto(alice.url());
  await expect(description(bob)).toBeVisible();

  await alice.context().setOffline(true);
  await expect(alice.getByText("Offline", { exact: true })).toBeVisible();
  await alice.getByRole("button", { name: "Image", exact: true }).click();
  await alice
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => loaded(alice)).toBe(1);
  await alice.reload();
  await expect.poll(() => loaded(alice)).toBe(1);

  await alice.context().setOffline(false);
  await expect.poll(() => loaded(bob)).toBe(1);
});
