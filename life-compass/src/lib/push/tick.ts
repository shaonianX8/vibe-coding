// 云端定时任务的核心：每 10 分钟运行一次，可以被重复调用而不重复发送。
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_PUSH_TEXT, decideReminder, type ExistingNotification, type ReminderProfile } from "../domain/reminders";
import { sendToUser } from "./send";

export interface TickResult {
  users: number;
  sent: number;
  retried: number;
  skipped: number;
  failed: number;
}

interface ProfileRow extends ReminderProfile {
  user_id: string;
}

export async function runReminderTick(admin: SupabaseClient, now: Date): Promise<TickResult> {
  const result: TickResult = { users: 0, sent: 0, retried: 0, skipped: 0, failed: 0 };
  const { data: profiles, error } = await admin.from("profiles").select("user_id,timezone,reminder_time,reminders_enabled,reminders_paused_until");
  if (error) throw new Error("读取用户设置失败");

  for (const p of (profiles ?? []) as ProfileRow[]) {
    result.users += 1;
    try {
      await handleUser(admin, p, now, result);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

async function handleUser(admin: SupabaseClient, p: ProfileRow, now: Date, result: TickResult) {
  // 先用「当前时间」算出本地日期，再查当天状态
  const probe = decideReminder({ now, profile: { ...p, reminders_enabled: true, reminders_paused_until: null }, planConfirmed: false, existing: null });
  if (probe.action !== "send") return;
  const localDate = probe.localDate;
  const dedupeKey = probe.dedupeKey;

  const [{ data: log }, { data: existingRow }] = await Promise.all([
    admin.from("daily_logs").select("plan_confirmed_at").eq("user_id", p.user_id).eq("local_date", localDate).maybeSingle(),
    admin.from("notifications").select("id,status,attempts,last_attempt_at").eq("user_id", p.user_id).eq("dedupe_key", dedupeKey).maybeSingle(),
  ]);

  const decision = decideReminder({
    now,
    profile: p,
    planConfirmed: Boolean(log?.plan_confirmed_at),
    existing: (existingRow as ExistingNotification | null) ?? null,
  });

  if (decision.action === "skip") {
    // 记录一次跳过原因，便于以后评估提醒是否有用；唯一键保证只记一次
    await admin
      .from("notifications")
      .upsert(
        { user_id: p.user_id, kind: "daily_plan", local_date: localDate, dedupe_key: dedupeKey, status: "skipped", skip_reason: decision.reason },
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      );
    result.skipped += 1;
    return;
  }
  if (decision.action !== "send" && decision.action !== "retry") return;

  // 抢占发送权：新建用唯一键，重试用乐观锁。并发或重复执行时只有一个调用能抢到。
  let notificationId: string | null = null;
  let attempts = 1;
  if (decision.action === "send") {
    const ins = await admin
      .from("notifications")
      .insert({ user_id: p.user_id, kind: "daily_plan", local_date: localDate, dedupe_key: dedupeKey, status: "pending", attempts: 1, last_attempt_at: now.toISOString() })
      .select("id")
      .maybeSingle();
    if (ins.error || !ins.data) return; // 唯一键冲突：别的调用已经在发
    notificationId = ins.data.id as string;
  } else {
    const prev = existingRow as { id: string; attempts: number };
    attempts = prev.attempts + 1;
    const claimed = await admin
      .from("notifications")
      .update({ status: "pending", attempts, last_attempt_at: now.toISOString() })
      .eq("id", prev.id)
      .eq("status", "failed")
      .eq("attempts", prev.attempts)
      .select("id")
      .maybeSingle();
    if (!claimed.data) return;
    notificationId = prev.id;
    result.retried += 1;
  }

  const summary = await sendToUser(admin, p.user_id, {
    ...DAILY_PUSH_TEXT,
    url: `/today?src=push&n=${notificationId}`,
    tag: "daily-plan",
  });

  if (summary.accepted > 0) {
    await admin
      .from("notifications")
      .update({ status: "accepted", accepted_count: summary.accepted, failed_count: summary.failed, accepted_at: new Date().toISOString(), last_error: summary.lastError })
      .eq("id", notificationId);
    result.sent += 1;
  } else {
    // 没有任何设备接收：可重试的错误留给下一轮，其他错误直接结束
    const terminal = !summary.retryable;
    await admin
      .from("notifications")
      .update({ status: "failed", failed_count: summary.failed + summary.expired, last_error: summary.lastError, attempts: terminal ? 99 : attempts })
      .eq("id", notificationId);
    result.failed += 1;
  }
}
