import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["media-composer.spec.ts","private-scene.spec.ts"],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_FEATURE_DESKTOP_SHELL: "true",
      VITE_FEATURE_SOUND_CENTER: "true",
      VITE_FEATURE_PUBLIC_RADIO: "true",
      VITE_FEATURE_ENTERTAINMENT: "true",
      VITE_FEATURE_PROVIDERS: "true",
      VITE_FEATURE_PROVIDER_NETEASE: "true",
      VITE_FEATURE_PROVIDER_QQ_MUSIC: "true",
      VITE_FEATURE_PROVIDER_KUGOU: "true",
      VITE_FEATURE_V2_PAGES: "true"
    }
  }
});
