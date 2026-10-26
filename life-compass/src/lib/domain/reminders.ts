// 提醒调度的判断逻辑。云端定时任务每 10 分钟调用一次，这里决定每个用户此刻该不该发。
// 规则：每天最多一条主提醒；已经确认计划就不发；没响应也不加频；失败有限重试。

import { localNow, timeToMinutes } from "./time";

export const REMINDER_WINDOW_MINUTES = 180; // 到点后 3 小时内仍可补发
export const MAX_ATTEMPTS = 3;
export const RETRY_GAP_MINUTES = 10;

export interface ReminderProfile {
  timezone: string;
  reminder_time: string;
  reminders_enabled: boolean;
  reminders_paused_until: string | null;
}

export interface ExistingNotification {
  status: "pending" | "accepted" | "failed" | "skipped";
  attempts: number;
  last_attempt_at: string | null;
}

export type ReminderDecision =
  | { action: "not_due" }
  | { action: "skip"; reason: "disabled" | "paused" | "already_planned" }
  | { action: "send"; localDate: string; dedupeKey: string }
  | { action: "retry"; localDate: string; dedupeKey: string }
  | { action: "done" };

export function dailyDedupeKey(localDate: string): string {
  return `daily_plan:${localDate}`;
}

export function decideReminder(input: {
  now: Date;
  profile: ReminderProfile;
  planConfirmed: boolean;
  existing: ExistingNotification | null;
}): ReminderDecision {
  const { now, profile, planConfirmed, existing } = input;
  const local = localNow(now, profile.timezone);
  const due = timeToMinutes(profile.reminder_time);
  if (local.minutes < due || local.minutes >= due + REMINDER_WINDOW_MINUTES) return { action: "not_due" };

  const dedupeKey = dailyDedupeKey(local.date);
  if (existing && existing.status !== "failed") return { action: "done" };
  if (!profile.reminders_enabled) return { action: "skip", reason: "disabled" };
  if (profile.reminders_paused_until && profile.reminders_paused_until >= local.date) return { action: "skip", reason: "paused" };
  if (planConfirmed) return { action: "skip", reason: "already_planned" };

  if (!existing) return { action: "send", localDate: local.date, dedupeKey };

  // 只重试明确失败的发送；pending（可能已送出）不重试，宁可漏发也不重复
  if (existing.attempts >= MAX_ATTEMPTS) return { action: "done" };
  const last = existing.last_attempt_at ? new Date(existing.last_attempt_at).getTime() : 0;
  if (now.getTime() - last < RETRY_GAP_MINUTES * 60_000) return { action: "done" };
  return { action: "retry", localDate: local.date, dedupeKey };
}

/** 锁屏上只出现这段文字：不含任务标题、金额、健康或关系信息 */
export const DAILY_PUSH_TEXT = {
  title: "人生校准器",
  body: "今天的两件事还没确认。点开，花一分钟。",
};
