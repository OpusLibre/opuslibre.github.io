import { expect, test, type Page } from "@playwright/test";
import scores from "../src/generated/scores.json" with { type: "json" };

const SLUGS = Object.keys(scores);

/** Fails on any browser error and on content wider than the viewport. */
async function check(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "débordement horizontal").toBeLessThanOrEqual(0);
  return errors;
}

test("la liste des partitions s'affiche sans débordement", async ({ page }) => {
  const errors = await check(page, "/fr/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".carte")).toHaveCount(SLUGS.length);
  expect(errors).toEqual([]);
});

for (const slug of SLUGS) {
  test(`la partition ${slug} se rend, avec lecteur et téléchargements`, async ({ page, request }) => {
    const errors = await check(page, `/fr/partitions/${slug}/`);
    const score = page.locator("[data-score] svg").first();
    await expect(score).toBeVisible({ timeout: 30_000 });
    // The engraving fits the width of the screen.
    const box = await score.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.locator("[data-score] .note").first()).toBeVisible();

    const play = page.getByRole("button", { name: /Lecture/ });
    await expect(play).toBeEnabled();
    await play.focus();
    await expect(play).toBeFocused();

    if ((scores as Record<string, { annotations: number }>)[slug]!.annotations > 0) {
      await expect(page.locator(".doigte").first()).toBeVisible();
      await page.getByLabel("Doigté pour petites mains").uncheck();
      await expect(page.locator(".doigte")).toHaveCount(0);
    }

    for (const name of ["PDF", "MusicXML", "MIDI"]) {
      const href = await page.getByRole("link", { name, exact: true }).getAttribute("href");
      expect((await request.get(href!)).status(), name).toBe(200);
    }
    // Overflow check again once the score is drawn.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("une page inconnue renvoie la page 404", async ({ page }) => {
  const response = await page.goto("/fr/nexiste-pas/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});
