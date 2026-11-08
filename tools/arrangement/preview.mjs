#!/usr/bin/env node
/**
 * Engraves a MusicXML file with Verovio (same engine as the site) and saves a PNG per page,
 * so an arrangement can be proofread as an image before it is published.
 *
 *   node tools/arrangement/preview.mjs score.musicxml out-prefix [pageWidthPx=1100]
 *   → out-prefix-1.png, out-prefix-2.png…
 */
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const [input, prefix, widthArg] = process.argv.slice(2);
if (!input || !prefix) { console.error("usage: preview.mjs score.musicxml out-prefix [width]"); process.exit(1); }
const width = Number(widthArg ?? 1100);
const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ pageWidth: width * 2.5, pageHeight: width * 2.5 * 1.414, scale: 40, adjustPageHeight: true, breaks: "auto", footer: "none", header: "auto" });
if (!tk.loadData(await readFile(input, "utf8"))) { console.error("MusicXML illisible par Verovio"); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1.5 });
for (let n = 1; n <= tk.getPageCount(); n += 1) {
  await page.setContent(`<body style="margin:0;background:#fff">${tk.renderToSVG(n)}</body>`);
  await page.locator("svg").first().screenshot({ path: `${prefix}-${n}.png` });
  console.log(`${prefix}-${n}.png`);
}
await browser.close();
