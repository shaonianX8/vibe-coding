// 推送发送：订阅失效会自动停用，临时失败标记为可重试。web-push 被替换为假实现。
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { USERS, admin, ensureUser, wipeUser } from "../helpers/local";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

const { sendToUser } = await import("@/lib/push/send");
let userId: string;
const payload = { title: "t", body: "b", url: "/today", tag: "daily-plan" };

beforeAll(async () => {
  userId = await ensureUser(USERS.owner.email, USERS.owner.password);
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

beforeEach(async () => {
  sendNotification.mockReset();
  await wipeUser(userId);
  await admin().from("push_subscriptions").insert([
    { user_id: userId, endpoint: "https://push.example/a", p256dh: "k", auth: "a" },
    { user_id: userId, endpoint: "https://push.example/b", p256dh: "k", auth: "a" },
  ]);
});

describe("发送推送", () => {
  it("一台设备的订阅已失效（410）：自动停用，另一台照常接收", async () => {
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/a")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const res = await sendToUser(admin(), userId, payload);
    expect(res).toMatchObject({ accepted: 1, expired: 1, retryable: false });
    const { data } = await admin().from("push_subscriptions").select("endpoint,disabled_reason").order("endpoint");
    expect(data).toEqual([
      { endpoint: "https://push.example/a", disabled_reason: "expired_410" },
      { endpoint: "https://push.example/b", disabled_reason: null },
    ]);
    // 已停用的订阅以后不再尝试
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
    await sendToUser(admin(), userId, payload);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("推送服务临时故障（503）或网络错误：标记为可重试", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 })).mockRejectedValueOnce(new Error("socket hang up"));
    const res = await sendToUser(admin(), userId, payload);
    expect(res).toMatchObject({ accepted: 0, failed: 2, retryable: true });
  });

  it("用户拒绝或从未开启通知（没有订阅）：返回明确原因，不报错", async () => {
    await admin().from("push_subscriptions").delete().eq("user_id", userId);
    const res = await sendToUser(admin(), userId, payload);
    expect(res.lastError).toBe("no_subscription");
  });
});
