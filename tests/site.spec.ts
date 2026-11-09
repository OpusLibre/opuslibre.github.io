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

test("l'accueil montre la recherche, les niveaux et les derniers ajouts", async ({ page }) => {
  const errors = await check(page, "/fr/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".featured svg").first()).toBeVisible();
  await expect(page.locator(".score-table tr")).toHaveCount(Math.min(8, SLUGS.length));
  await page.getByLabel("Rechercher une partition").fill("bach");
  await page.getByLabel("Rechercher une partition").press("Enter");
  await expect(page).toHaveURL(/\/fr\/partitions\/\?q=bach/);
  await expect(page.locator(".score-table tr:visible")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("le catalogue filtre pendant la frappe et par niveau, instrument, compositeur", async ({ page }) => {
  const errors = await check(page, "/fr/partitions/");
  const rows = page.locator(".score-table tr:visible");
  await expect(rows).toHaveCount(SLUGS.length);
  const search = page.getByLabel("Rechercher une partition");
  await search.fill("prelude"); // without the accent
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Prélude");
  await search.fill("introuvable xyz");
  await expect(page.getByText("Aucune partition ne correspond")).toBeVisible();
  await page.getByRole("button", { name: "effacez les filtres" }).click();
  await expect(rows).toHaveCount(SLUGS.length);
  await page.locator("label", { hasText: "Voix" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page).toHaveURL(/instrument=voix/);
  // Filters come back from the URL (shared links, links from the level pages).
  await page.goto("/fr/partitions/?niveau=original");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Prélude");
  expect(errors).toEqual([]);
});

for (const path of ["/fr/compositeurs/", "/fr/compositeurs/bach/", "/fr/niveaux/", "/fr/instruments/"]) {
  test(`la page ${path} s'affiche sans débordement`, async ({ page }) => {
    const errors = await check(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("la navigation principale est accessible à toutes les largeurs", async ({ page }) => {
  await page.goto("/fr/");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  if (!(await nav.isVisible())) await page.getByText("Menu", { exact: true }).click();
  await nav.getByRole("link", { name: "Compositeurs" }).click();
  await expect(page).toHaveURL(/\/fr\/compositeurs\/$/);
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

    const play = page.getByRole("button", { name: /Écouter/ });
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

test("la racine renvoie vers la version française", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr\/$/);
  await expect(page.getByRole("link", { name: "Opus Libre, accueil" })).toBeVisible();
});
