import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  // Retry once: e2e runs against the live deploy, where parallel load can
  // momentarily abort a hero-video/image sub-request (transient, not a bug).
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3007",
    channel: "chrome",
    headless: true,
  },
});
