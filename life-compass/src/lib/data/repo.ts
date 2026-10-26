// 数据访问层：只做读写，不含业务判断。所有查询通过用户自己的会话执行，受 RLS 约束。
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyLog, Mode, Profile, StrategyContent, Task, TaskDraft, TaskKind } from "../domain/types";
import type { AlertFeedback } from "../domain/alerts";
import { STRATEGY_TEMPLATE } from "../strategy/template";

type DB = SupabaseClient;

export interface StrategyVersion {
  id: string;
  version: number;
  status: "active" | "archived" | "proposed" | "rejected";
  content: StrategyContent;
  change_summary: string | null;
  change_reason: string | null;
  evidence: string | null;
  source: "template" | "user" | "restore" | "ai_proposal";
  confirmed_by_user: boolean;
  confirmed_at: string | null;
  created_at: string;
}

export interface Belief {
  id: string;
  kind: "fact" | "hypothesis" | "constraint";
  statement: string;
  source: "user_confirmed" | "system_observed" | "imported" | "ai_inferred";
  confirmed_by_user: boolean;
  is_valid: boolean;
  review_after: string | null;
  evidence: string | null;
  created_at: string;
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(`数据库错误 ${res.error.code ?? ""}`.trim());
  return res.data;
}

export async function ensureProfile(db: DB, userId: string): Promise<Profile> {
  const existing = await db.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (existing.data) return existing.data as Profile;
  const created = await db.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (created.data) return created.data as Profile;
  return check(await db.from("profiles").select("*").eq("user_id", userId).single()) as Profile;
}

export async function updateProfile(db: DB, userId: string, patch: Partial<Profile>) {
  check(await db.from("profiles").update(patch).eq("user_id", userId));
}

export async function getActiveStrategy(db: DB): Promise<StrategyVersion> {
  const res = await db.from("strategy_versions").select("*").eq("status", "active").maybeSingle();
  if (res.data) return res.data as StrategyVersion;
  // 首次使用：从不含敏感信息的模板初始化，标记为待确认
  const created = await db.rpc("save_strategy_version", {
    p_content: STRATEGY_TEMPLATE,
    p_change_summary: "从初始模板创建",
    p_change_reason: null,
    p_evidence: null,
    p_source: "template",
    p_based_on: null,
  });
  if (created.error) {
    // 并发初始化时另一请求可能已写入
    return check(await db.from("strategy_versions").select("*").eq("status", "active").single()) as StrategyVersion;
  }
  return created.data as StrategyVersion;
}

export async function listStrategyVersions(db: DB): Promise<StrategyVersion[]> {
  return check(await db.from("strategy_versions").select("*").order("version", { ascending: false }).limit(30)) as StrategyVersion[];
}

export async function saveStrategyVersion(
  db: DB,
  input: { content: StrategyContent; summary: string; reason: string; evidence: string | null; source: "user" | "restore"; basedOn: number },
): Promise<StrategyVersion> {
  return check(
    await db.rpc("save_strategy_version", {
      p_content: input.content,
      p_change_summary: input.summary,
      p_change_reason: input.reason,
      p_evidence: input.evidence,
      p_source: input.source,
      p_based_on: input.basedOn,
    }),
  ) as StrategyVersion;
}

export async function getTasksSince(db: DB, fromDate: string): Promise<Task[]> {
  return check(await db.from("tasks").select("*").gte("local_date", fromDate).order("local_date", { ascending: false }).limit(500)) as Task[];
}

export async function getTask(db: DB, id: string): Promise<Task | null> {
  return (await db.from("tasks").select("*").eq("id", id).maybeSingle()).data as Task | null;
}

export async function findActiveTask(db: DB, localDate: string, kind: TaskKind): Promise<Task | null> {
  return (await db.from("tasks").select("*").eq("local_date", localDate).eq("kind", kind).neq("status", "cancelled").maybeSingle()).data as Task | null;
}

type TaskFields = Omit<TaskDraft, "origin_note">;

/**
 * 写入某天某类的关键任务。
 * mode = "plan"：确认当天计划，更新表单里显示的那件待执行任务。
 * mode = "followup"：采纳下一步建议，只有当那天的待执行任务正是由同一件原任务继承来的才更新，否则拒绝，避免悄悄覆盖已有计划。
 */
export async function putTask(
  db: DB,
  userId: string,
  localDate: string,
  fields: TaskFields,
  mode: "plan" | "followup" = "plan",
): Promise<{ ok: true; task: Task } | { ok: false; reason: string }> {
  const existing = await findActiveTask(db, localDate, fields.kind);
  if (existing && existing.status !== "planned") return { ok: false, reason: "那天已有记录过结果的同类任务" };
  if (existing && mode === "followup" && existing.carried_from_task_id !== fields.carried_from_task_id) {
    return { ok: false, reason: `那天已经安排了「${existing.title}」。可以换个日期，或者先修改那件任务。` };
  }
  if (existing) {
    const updated = check(await db.from("tasks").update(fields).eq("id", existing.id).select("*").single()) as Task;
    return { ok: true, task: updated };
  }
  const res = await db.from("tasks").insert({ ...fields, user_id: userId, local_date: localDate }).select("*").single();
  if (res.error?.code === "23505") {
    const again = await findActiveTask(db, localDate, fields.kind);
    if (again) return { ok: true, task: again };
  }
  return { ok: true, task: check(res) as Task };
}

export async function updateTask(db: DB, id: string, patch: Partial<Task>) {
  check(await db.from("tasks").update(patch).eq("id", id));
}

export async function getDailyLogsSince(db: DB, fromDate: string): Promise<DailyLog[]> {
  return check(await db.from("daily_logs").select("*").gte("local_date", fromDate).order("local_date", { ascending: false })) as DailyLog[];
}

export async function ensureDailyLog(db: DB, userId: string, localDate: string, mode: Mode, fromPush: boolean): Promise<DailyLog> {
  await db
    .from("daily_logs")
    .upsert({ user_id: userId, local_date: localDate, mode, first_opened_at: new Date().toISOString(), opened_from_push: fromPush }, { onConflict: "user_id,local_date", ignoreDuplicates: true });
  if (fromPush) await db.from("daily_logs").update({ opened_from_push: true }).eq("local_date", localDate);
  return check(await db.from("daily_logs").select("*").eq("local_date", localDate).single()) as DailyLog;
}

export async function updateDailyLog(db: DB, localDate: string, patch: Record<string, unknown>) {
  check(await db.from("daily_logs").update(patch).eq("local_date", localDate));
}

export async function listBeliefs(db: DB): Promise<Belief[]> {
  return check(await db.from("beliefs").select("*").order("created_at", { ascending: false })) as Belief[];
}

export async function getAlertFeedback(db: DB, fromDate: string): Promise<AlertFeedback[]> {
  return check(await db.from("alert_feedback").select("alert_key,verdict,local_date").gte("local_date", fromDate)) as AlertFeedback[];
}

export async function countAiUsageSince(db: DB, sinceIso: string): Promise<number> {
  const res = await db.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
  return res.count ?? 0;
}
