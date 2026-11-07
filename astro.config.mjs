import { defineConfig } from "astro/config";

// Static output only: the site is HTML/JS/CSS; generated score files live on R2 (served by the Worker under /p/).
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { build: { assetsInlineLimit: 0 } },
});
