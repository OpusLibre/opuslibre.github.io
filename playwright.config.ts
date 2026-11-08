import { defineConfig, devices } from "@playwright/test";

// Responsive checks at phone, tablet and desktop widths against the built site.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4411" },
  webServer: { command: "node scripts/serve-local.mjs", url: "http://localhost:4411/fr/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: "tablette-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "bureau-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
