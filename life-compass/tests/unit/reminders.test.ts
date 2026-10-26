import { describe, expect, it } from "vitest";
import { DAILY_PUSH_TEXT, decideReminder } from "@/lib/domain/reminders";

const profile = { timezone: "Asia/Shanghai", reminder_time: "10:00:00", reminders_enabled: true, reminders_paused_until: null };
// 上海 10:05 = UTC 02:05
const at1005 = new Date("2026-10-26T02:05:00Z");

describe("每日提醒调度", () => {
  it("到点前不发，到点后发", () => {
    expect(decideReminder({ now: new Date("2026-10-26T01:55:00Z"), profile, planConfirmed: false, existing: null }).action).toBe("not_due");
    expect(decideReminder({ now: at1005, profile, planConfirmed: false, existing: null })).toEqual({
      action: "send",
      localDate: "2026-10-26",
      dedupeKey: "daily_plan:2026-10-26",
    });
  });

  it("超过补发窗口不再发，避免深夜打扰", () => {
    expect(decideReminder({ now: new Date("2026-10-26T05:30:00Z"), profile, planConfirmed: false, existing: null }).action).toBe("not_due");
  });

  it("当天已经确认计划，不再发送同样的提醒", () => {
    expect(decideReminder({ now: at1005, profile, planConfirmed: true, existing: null })).toEqual({ action: "skip", reason: "already_planned" });
  });

  it("特别测试：重复执行定时任务不会重复发送", () => {
    const sent = { status: "accepted" as const, attempts: 1, last_attempt_at: "2026-10-26T02:00:30Z" };
    expect(decideReminder({ now: at1005, profile, planConfirmed: false, existing: sent }).action).toBe("done");
    const inFlight = { status: "pending" as const, attempts: 1, last_attempt_at: "2026-10-26T02:00:30Z" };
    expect(decideReminder({ now: new Date("2026-10-26T03:00:00Z"), profile, planConfirmed: false, existing: inFlight }).action).toBe("done");
  });

  it("明确失败后有限重试，有间隔，有上限", () => {
    const failed = { status: "failed" as const, attempts: 1, last_attempt_at: "2026-10-26T02:00:00Z" };
    expect(decideReminder({ now: new Date("2026-10-26T02:05:00Z"), profile, planConfirmed: false, existing: failed }).action).toBe("done");
    expect(decideReminder({ now: new Date("2026-10-26T02:15:00Z"), profile, planConfirmed: false, existing: failed }).action).toBe("retry");
    const exhausted = { ...failed, attempts: 3 };
    expect(decideReminder({ now: new Date("2026-10-26T02:45:00Z"), profile, planConfirmed: false, existing: exhausted }).action).toBe("done");
  });

  it("暂停与关闭", () => {
    expect(decideReminder({ now: at1005, profile: { ...profile, reminders_paused_until: "2026-10-27" }, planConfirmed: false, existing: null })).toEqual({
      action: "skip",
      reason: "paused",
    });
    expect(decideReminder({ now: at1005, profile: { ...profile, reminders_paused_until: "2026-10-25" }, planConfirmed: false, existing: null }).action).toBe("send");
    expect(decideReminder({ now: at1005, profile: { ...profile, reminders_enabled: false }, planConfirmed: false, existing: null })).toEqual({
      action: "skip",
      reason: "disabled",
    });
  });

  it("用户修改提醒时间后按新时间判断", () => {
    const p = { ...profile, reminder_time: "08:30" };
    expect(decideReminder({ now: new Date("2026-10-26T00:35:00Z"), profile: p, planConfirmed: false, existing: null }).action).toBe("send");
  });

  it("锁屏文字不包含敏感信息", () => {
    expect(JSON.stringify(DAILY_PUSH_TEXT)).not.toMatch(/债|钱|病|医|还款|吵|分手/);
  });
});
