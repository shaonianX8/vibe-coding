import { defineConfig, devices } from "@playwright/test";

// 端到端测试只连接本地 Supabase（npx supabase start），模拟数据与正式数据完全隔离。
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    ...devices["iPhone 13"],
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  projects: [{ name: "iphone", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run start -- -p 3000",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
