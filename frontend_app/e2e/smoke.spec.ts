import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const fixtures = ["riviera-travel-guide.pdf", "taste-of-provence.pdf", "beach-myths.pdf"].map((f) =>
  path.join(__dirname, "fixtures", f),
);

async function uploadFixtures(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Connect ideas across your PDFs")).toBeVisible();
  await expect(page.getByText("Keyword mode")).toBeVisible();
  // The welcome dropzone's hidden file input
  // Tests share one backend, so later tests see these as duplicates; either way
  // all three end up in the library.
  await page.locator('main input[type="file"]').setInputFiles(fixtures);
  await expect(page.getByText(/documents added|already in your library/).first()).toBeVisible();
  const library = page.getByRole("complementary", { name: "Library" });
  for (const title of ["Riviera Travel Guide", "Taste of Provence", "Beach Myths of the Riviera"]) {
    await expect(library.getByRole("button", { name: new RegExp(`^${title}`) })).toBeVisible({
      timeout: 30_000,
    });
  }
  await expect(library.getByText("Indexing…")).toHaveCount(0, { timeout: 30_000 });
  return library;
}

/** Drag-select across the text-layer span containing `text`. */
async function selectText(page: Page, text: RegExp) {
  const span = page.locator(".textLayer span:not(:has(span))", { hasText: text }).first();
  await expect(span).toBeVisible();
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  // Deliberately overshoot past the page edge: the selection must not run away.
  await page.mouse.move(box.x + box.width + 400, box.y + box.height * 2.5, { steps: 10 });
  await page.mouse.up();
}

test("upload, select, connect, jump and listen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const library = await uploadFixtures(page);
  await expect(library.getByRole("button", { name: /^Riviera Travel Guide/ })).toBeVisible();

  // The first upload opens automatically; open the travel guide explicitly.
  await library.getByRole("button", { name: /^Riviera Travel Guide/ }).click();
  await expect(page.locator("header")).toContainText("Riviera Travel Guide");
  await expect(page.getByText(/^Page 1 of 1$/)).toBeVisible();

  // Outline lists detected sections
  await page.getByRole("tab", { name: "Outline" }).click();
  await expect(page.getByRole("button", { name: /Beaches of Nice/ })).toBeVisible();

  await selectText(page, /beaches of Nice are covered/);
  const find = page.getByRole("button", { name: "Find connections" });
  await expect(find).toBeVisible();
  await find.click();

  const panel = page.getByRole("complementary", { name: "Connections" });
  await expect(panel.locator("blockquote").first()).toContainText("beaches of Nice");
  const cards = panel.locator("li button");
  await expect(cards.first()).toBeVisible();
  await expect(panel.getByText(/keyword matches/)).toBeVisible();

  // Selecting overshoot must stay within the passage (not thousands of chars)
  const quote = (await panel.locator("figure blockquote").textContent()) ?? "";
  expect(quote.length).toBeLessThan(400);

  // The beach myths document is the top match; opening it jumps and highlights.
  const myths = cards.filter({ hasText: "Beach Myths of the Riviera" }).first();
  await expect(myths).toBeVisible();
  await myths.click();
  await expect(page.locator("header")).toContainText("Beach Myths of the Riviera");
  await expect(page.locator('[data-page-number] div[style*="--highlight"]').first()).toBeVisible();

  // Insights explain that a key is needed; podcast falls back to browser speech.
  await panel.getByRole("tab", { name: "Insights" }).click();
  await expect(panel.getByText(/Insights need Gemini/)).toBeVisible();
  await panel.getByRole("tab", { name: "Podcast" }).click();
  await panel.getByRole("button", { name: "Create episode" }).click();
  await expect(panel.getByRole("list", { name: "Transcript" })).toBeVisible();
  await expect(panel.getByText(/Read by your browser/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("duplicates are detected and documents can be deleted", async ({ page }) => {
  const library = await uploadFixtures(page);
  await page.locator('aside input[type="file"]').setInputFiles(fixtures[0]);
  await expect(page.getByText("riviera-travel-guide.pdf is already in your library.")).toBeVisible();

  const item = library.getByRole("listitem").filter({ hasText: "Taste of Provence" });
  await item.hover();
  await item.getByRole("button", { name: /^Delete/ }).click();
  await item.getByRole("button", { name: "Delete?" }).click();
  await expect(library.getByText("Taste of Provence")).toHaveCount(0);
});

test("mobile layout has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Connect ideas across your PDFs")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
  await page.getByRole("button", { name: "Toggle library" }).click();
  await expect(page.getByRole("button", { name: "Add PDFs" })).toBeInViewport();
});
