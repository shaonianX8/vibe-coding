import { test } from "@playwright/test";
import { USERS } from "../helpers/local";

// 仅在设置 SCREENSHOT_DIR 时运行：保存三个主页面的截图，用于人工检查界面。
test.skip(!process.env.SCREENSHOT_DIR, "未设置 SCREENSHOT_DIR");

for (const scheme of ["light", "dark"] as const) {
  test(`截图（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/login");
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${scheme}-0-login.png` });
    await page.fill("#email", USERS.owner.email);
    await page.fill("#password", USERS.owner.password);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL(/\/today/);
    for (const [i, p] of ["/today", "/records", "/direction"].entries()) {
      await page.goto(p);
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${scheme}-${i + 1}${p.replace("/", "-")}.png`, fullPage: true });
    }
  });
}
