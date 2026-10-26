// 云端提醒调度：针对真实数据库运行，推送发送被替换为假实现。
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { USERS, admin, ensureUser, wipeUser } from "../helpers/local";

const sendMock = vi.fn();
vi.mock("@/lib/push/send", () => ({ sendToUser: (...args: unknown[]) => sendMock(...args) }));

const { runReminderTick } = await import("@/lib/push/tick");

let ownerId: string;
let otherId: string;
const at1005 = new Date("2026-10-26T02:05:00Z"); // 上海 10:05

const ok = { accepted: 1, failed: 0, expired: 0, retryable: false, lastError: null };
const retryableFail = { accepted: 0, failed: 1, expired: 0, retryable: true, lastError: "http_503" };

beforeAll(async () => {
  ownerId = await ensureUser(USERS.owner.email, USERS.owner.password);
  otherId = await ensureUser(USERS.other.email, USERS.other.password);
});

beforeEach(async () => {
  sendMock.mockReset();
  const a = admin();
  // 只保留两个测试用户的设置，避免其他测试残留影响计数
  await a.from("profiles").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
  for (const id of [ownerId, otherId]) {
    await wipeUser(id);
  }
  await a.from("profiles").insert([
    { user_id: ownerId, reminder_time: "10:00", reminders_enabled: true },
    { user_id: otherId, reminder_time: "10:00", reminders_enabled: false },
  ]);
});

async function notifications(userId: string) {
  return (await admin().from("notifications").select("*").eq("user_id", userId)).data ?? [];
}

describe("每日提醒调度", () => {
  it("特别测试：重复执行、并发执行定时任务，同一提醒只发一次", async () => {
    sendMock.mockResolvedValue(ok);
    await Promise.all(Array.from({ length: 5 }, () => runReminderTick(admin(), at1005)));
    await runReminderTick(admin(), new Date("2026-10-26T02:15:00Z"));
    expect(sendMock).toHaveBeenCalledTimes(1);
    const rows = await notifications(ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "accepted", attempts: 1, dedupe_key: "daily_plan:2026-10-26", opened_at: null });
  });

  it("锁屏内容不含任务或敏感信息，点开链接带通知编号", async () => {
    sendMock.mockResolvedValue(ok);
    await admin().from("tasks").insert({ user_id: ownerId, local_date: "2026-10-26", kind: "reality", title: "还清信用卡欠款" });
    await runReminderTick(admin(), at1005);
    const payload = sendMock.mock.calls[0][2] as { title: string; body: string; url: string };
    expect(JSON.stringify(payload)).not.toContain("信用卡");
    expect(payload.url).toMatch(/^\/today\?src=push&n=[0-9a-f-]{36}$/);
  });

  it("当天已经确认计划，不发送，只记录跳过原因", async () => {
    sendMock.mockResolvedValue(ok);
    await admin().from("daily_logs").insert({ user_id: ownerId, local_date: "2026-10-26", mode: "normal", plan_confirmed_at: new Date().toISOString() });
    await runReminderTick(admin(), at1005);
    expect(sendMock).not.toHaveBeenCalled();
    expect((await notifications(ownerId))[0]).toMatchObject({ status: "skipped", skip_reason: "already_planned" });
  });

  it("关闭提醒的用户不会收到；没响应也不会加发", async () => {
    sendMock.mockResolvedValue(ok);
    await runReminderTick(admin(), at1005);
    expect(sendMock.mock.calls.map((c) => c[1])).toEqual([ownerId]);
    expect((await notifications(otherId))[0]).toMatchObject({ status: "skipped", skip_reason: "disabled" });
    // 用户一直没点开，后续多次执行也不会再发
    for (const t of ["02:30", "03:00", "04:00"]) await runReminderTick(admin(), new Date(`2026-10-26T${t}:00Z`));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("推送服务临时失败：间隔后重试，成功后停止", async () => {
    sendMock.mockResolvedValueOnce(retryableFail).mockResolvedValue(ok);
    await runReminderTick(admin(), at1005);
    expect((await notifications(ownerId))[0]).toMatchObject({ status: "failed", attempts: 1, last_error: "http_503" });
    await runReminderTick(admin(), new Date("2026-10-26T02:08:00Z")); // 间隔不足，不重试
    expect(sendMock).toHaveBeenCalledTimes(1);
    await runReminderTick(admin(), new Date("2026-10-26T02:20:00Z"));
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect((await notifications(ownerId))[0]).toMatchObject({ status: "accepted", attempts: 2 });
  });

  it("没有任何设备订阅时，记录失败但不反复重试", async () => {
    sendMock.mockResolvedValue({ accepted: 0, failed: 0, expired: 0, retryable: false, lastError: "no_subscription" });
    await runReminderTick(admin(), at1005);
    await runReminderTick(admin(), new Date("2026-10-26T02:30:00Z"));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect((await notifications(ownerId))[0]).toMatchObject({ status: "failed", last_error: "no_subscription" });
  });

  it("跨天、跨月、跨年按本地日期各发一次", async () => {
    sendMock.mockResolvedValue(ok);
    await runReminderTick(admin(), new Date("2026-10-31T02:05:00Z"));
    await runReminderTick(admin(), new Date("2026-11-01T02:05:00Z"));
    await runReminderTick(admin(), new Date("2026-12-31T02:05:00Z"));
    await runReminderTick(admin(), new Date("2027-01-01T02:05:00Z"));
    const keys = (await notifications(ownerId)).map((n) => n.dedupe_key).sort();
    expect(keys).toEqual(["daily_plan:2026-10-31", "daily_plan:2026-11-01", "daily_plan:2026-12-31", "daily_plan:2027-01-01"]);
  });
});
