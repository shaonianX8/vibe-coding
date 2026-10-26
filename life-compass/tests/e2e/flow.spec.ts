import { expect, test, type Page } from "@playwright/test";
import { USERS, admin, signedIn } from "../helpers/local";
import { addDays, localDate } from "../../src/lib/domain/time";

const today = localDate(new Date(), "Asia/Shanghai");
const tomorrow = addDays(today, 1);
// Next.js 自带的路由播报器也是 role=alert，排除它
const ALERT = "[role=alert]:not(#__next-route-announcer__)";

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.fill("#email", USERS[who].email);
  await page.fill("#password", USERS[who].password);
  await page.getByRole("button", { name: "登录" }).click();
  if (who !== "stranger") await page.waitForURL(/\/today/);
}

test.describe.serial("V0 核心闭环（iPhone 视口）", () => {
  test("未登录跳转登录页；允许名单外的账户无法登录", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);
    await login(page, "stranger");
    await expect(page.locator(ALERT)).toContainText("邮箱或密码不正确");
    await expect(page).toHaveURL(/\/login/);
  });

  test("API 未登录返回 401，定时任务没有密钥返回 401", async ({ request }) => {
    expect((await request.get("/api/export")).status()).toBe(401);
    expect((await request.post("/api/cron/tick")).status()).toBe(401);
    expect((await request.post("/api/cron/tick", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  });

  test("登录后显示长期战略，并预填今天的两件关键任务", async ({ page }) => {
    await login(page, "owner");
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("当前阶段：经济安全和长期创作基础建设期")).toBeVisible();
    await expect(page.locator("#reality-title")).toHaveValue("推进一项能带来收入的专业交付");
    await expect(page.locator("#long_term-title")).toHaveValue("写一篇个人原创文章的一个论点");

    await page.locator("#reality-title").fill("完成客户稿件第三节");
    await page.locator("#reality-start_time").fill("10:30");
    await page.getByRole("button", { name: "确认今天的计划" }).click();
    await expect(page.getByRole("heading", { name: "完成客户稿件第三节" })).toBeVisible();
    await expect(page.getByText("第一步：")).toHaveCount(2);

    await page.goto("/direction");
    await expect(page.locator(".kicker", { hasText: "2036 长期战略" })).toBeVisible();
    await expect(page.getByText("还没有经过你确认")).toBeVisible();
  });

  test("开始行动；未开始时按障碍给出调整，并可以修改后采纳", async ({ page }) => {
    await login(page, "owner");
    const reality = page.getByRole("region", { name: "现实责任" });
    await reality.getByRole("button", { name: "开始行动" }).click();
    await expect(reality.getByText(/已开始/)).toBeVisible();

    await reality.getByRole("button", { name: "记录结果" }).click();
    await reality.getByText("未开始", { exact: true }).click();
    await reality.getByText("任务太大", { exact: true }).click();
    await reality.getByRole("button", { name: "保存结果" }).click();

    const panel = reality.getByRole("region", { name: "下一步建议" }).or(reality.locator("[aria-label=下一步建议]"));
    await expect(panel.getByText("没有开始。先调整条件，再试一次。")).toBeVisible();
    await expect(panel.getByText("缩小任务", { exact: true })).toBeVisible();
    await expect(panel.locator("input[name=date]")).toHaveValue(tomorrow);
    await panel.locator("input[name=title]").fill("客户稿件第三节：只写开头两段");
    await panel.getByRole("button", { name: "按这个安排" }).click();
    await expect(reality.getByText("已修改后安排")).toBeVisible();

    const { data } = await admin().from("tasks").select("title,adjustment,source,carried_from_task_id").eq("local_date", tomorrow).eq("kind", "reality").single();
    expect(data).toMatchObject({ title: "客户稿件第三节：只写开头两段", adjustment: "shrink", source: "rule_suggestion" });
    expect(data?.carried_from_task_id).toBeTruthy();
  });

  test("长期任务完成；AI 细化建议可以采纳（测试模型）", async ({ page }) => {
    await login(page, "owner");
    const long = page.getByRole("region", { name: "长期积累" });
    await long.getByRole("button", { name: "记录结果" }).click();
    await long.getByText("已完成", { exact: true }).click();
    await long.getByText("完成交付", { exact: true }).click();
    await long.locator("textarea[name=result_note]").fill("发布了一篇 800 字短文");
    await long.getByRole("button", { name: "保存结果" }).click();
    await expect(long.getByText("已完成。决定下一步是否继续。")).toBeVisible();

    await long.getByRole("button", { name: "让 AI 细化这条建议" }).click();
    await expect(long.getByText(/AI 补充（mock-model/)).toBeVisible();
    await long.getByRole("button", { name: "把 AI 的版本填入下方" }).click();
    await expect(long.locator("input[name=title]")).toHaveValue("测试：缩小后的任务");
    await long.getByRole("button", { name: "按这个安排" }).click();
    await expect(long.getByText("已按建议安排")).toBeVisible();

    const { data: ai } = await admin().from("ai_suggestions").select("status").order("created_at", { ascending: false }).limit(1).single();
    expect(ai?.status).toBe("accepted");
  });

  test("记录页只用真实数据，并显示工具自检", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/records");
    await expect(page.getByText("原创交付：1 次")).toBeVisible();
    await expect(page.getByText("反复出现的障碍：任务太大 1 次")).toBeVisible();
    await expect(page.getByText(/确认计划耗时中位数：\d+ 秒/)).toBeVisible();
  });

  test("战略修改必须写原因，保存为新版本，可以恢复旧版本", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/direction");
    await page.getByText("修改战略（会保存为新版本）").click();
    await page.locator("#f-constraint_statement").fill("现金流不稳定");
    await page.locator("#change_reason").fill("季度校准：现金流是当前最主要的限制");
    await page.getByRole("button", { name: "保存为新版本" }).click();
    await expect(page.getByText(/已保存为第 2 版/)).toBeVisible();
    await page.reload();
    await expect(page.getByText("现金流不稳定").first()).toBeVisible();

    await page.getByText(/历史版本/).click();
    await page.getByRole("button", { name: "恢复" }).first().click();
    await expect(page.getByText("恢复到第 1 版").first()).toBeVisible();
    const { data } = await admin().from("strategy_versions").select("version,status,source").order("version");
    expect(data?.map((v) => v.status)).toEqual(["archived", "archived", "active"]);
    expect(data?.[2].source).toBe("restore");
  });

  test("添加待验证假设，修改提醒设置，导出数据", async ({ page }) => {
    await login(page, "owner");
    await page.goto("/direction");
    await page.getByText("添加一条").click();
    await page.locator("#belief-statement").fill("有外部截止时间时更容易开始");
    await page.getByRole("button", { name: "添加" }).click();
    await expect(page.getByText("有外部截止时间时更容易开始")).toBeVisible();
    await expect(page.getByText("待验证假设").first()).toBeVisible();

    await page.locator("#reminder_time").fill("09:15");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存")).toBeVisible();

    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("life-compass-export-v1");
    expect(body.tasks.length).toBeGreaterThanOrEqual(4);
    expect(body.beliefs[0].statement).toBe("有外部截止时间时更容易开始");
    expect(JSON.stringify(body.push_subscriptions ?? [])).not.toContain("p256dh");
  });

  test("特别测试：网络中断时不丢失已填写的结果", async ({ page, context }) => {
    // 给明天的任务补一个今天的入口：直接在记录页补记一条昨天的任务
    const owner = await signedIn(USERS.owner.email, USERS.owner.password);
    const { data: me } = await owner.auth.getUser();
    await owner.from("tasks").insert({ user_id: me.user!.id, local_date: addDays(today, -1), kind: "reality", title: "昨天的未记录任务" });

    await login(page, "owner");
    await page.goto("/records");
    await page.locator("summary", { hasText: "昨天的未记录任务" }).click();
    const form = page.locator("details[open] form");
    await form.getByText("部分完成", { exact: true }).click();
    await form.locator("textarea[name=result_note]").fill("断网前写下的内容");
    await context.setOffline(true);
    await form.getByRole("button", { name: "保存结果" }).click();
    await expect(page.locator(ALERT)).toContainText("网络中断");
    await context.setOffline(false);
    await page.reload();
    await page.locator("summary", { hasText: "昨天的未记录任务" }).click();
    await expect(page.locator("details[open] textarea[name=result_note]")).toHaveValue("断网前写下的内容");
    await page.locator("details[open] form").getByRole("button", { name: "保存结果" }).click();
    await expect(page.getByText("补记结果")).toHaveCount(0);
  });

  test("不同账户看不到彼此的数据", async ({ page }) => {
    await login(page, "other");
    await expect(page).toHaveURL(/\/today/);
    await expect(page.locator("#reality-title")).toHaveValue("推进一项能带来收入的专业交付");
    await expect(page.getByText("完成客户稿件第三节")).toHaveCount(0);
    const body = await (await page.request.get("/api/export")).json();
    expect(body.tasks).toHaveLength(0);
    expect(body.beliefs).toHaveLength(0);
    await page.goto("/records");
    await expect(page.getByText("还没有记录。没有数据时，系统不做判断。")).toBeVisible();
  });

  test("AI 不可用（达到 24 小时调用上限）时，规则建议和记录照常可用", async ({ page }) => {
    // 测试环境中 other 账户使用失败的测试模型：通过 24 小时调用上限模拟 AI 不可用
    const other = await signedIn(USERS.other.email, USERS.other.password);
    const { data: me } = await other.auth.getUser();
    const rows = Array.from({ length: 20 }, () => ({ user_id: me.user!.id, purpose: "followup", model: "mock-model", ok: false, error_code: "network" }));
    await other.from("ai_usage").insert(rows);

    await login(page, "other");
    await page.getByRole("button", { name: "确认今天的计划" }).click();
    const reality = page.getByRole("region", { name: "现实责任" });
    await reality.getByRole("button", { name: "记录结果" }).click();
    await reality.getByText("未开始", { exact: true }).click();
    await reality.getByText("不知道第一步", { exact: true }).click();
    await reality.getByRole("button", { name: "保存结果" }).click();
    await expect(reality.getByText("先写清第一步", { exact: true })).toBeVisible();
    await reality.getByRole("button", { name: "让 AI 细化这条建议" }).click();
    await expect(reality.locator(ALERT)).toContainText("规则建议仍然有效");
    await expect(reality.getByRole("button", { name: "按这个安排" })).toBeVisible();
  });

  test("页面在 iPhone 宽度下没有横向滚动，深色模式可用", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await login(page, "owner");
    for (const p of ["/today", "/records", "/direction"]) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, p).toBeLessThanOrEqual(0);
    }
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(18, 20, 18)");
  });

  test("云端定时任务：带密钥可调用，重复调用不重复记录", async ({ request }) => {
    const url = `/api/cron/tick?now=${today}T02:05:00Z`; // 上海 10:05
    const headers = { authorization: "Bearer local-test-cron-secret" };
    const first = await request.post(url, { headers });
    expect(first.status()).toBe(200);
    expect((await first.json()).ok).toBe(true);
    await request.post(url, { headers });
    const { data } = await admin().from("notifications").select("user_id,status,skip_reason").eq("kind", "daily_plan").eq("local_date", today);
    // 两个账户今天都已确认计划：各记录一次「已计划，跳过」，没有重复
    expect(data?.filter((n) => n.status === "skipped" && n.skip_reason === "already_planned")).toHaveLength(2);
  });

  test("测试推送：没有订阅时给出明确提示，不影响其他功能", async ({ page }) => {
    await login(page, "owner");
    const res = await page.request.post("/api/push/test");
    expect((await res.json()).message).toContain("还没有开启通知");
  });

  test("PWA 清单与 service worker 可访问", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/today");
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
  });
});
