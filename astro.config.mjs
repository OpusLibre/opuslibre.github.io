import { defineConfig } from "astro/config";

// Static output only (GitHub Pages): the generated score files are copied into dist/p/ by scripts/pages.mjs.
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { build: { assetsInlineLimit: 0 } },
});
