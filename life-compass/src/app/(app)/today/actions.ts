"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { ensureDailyLog, ensureProfile, findActiveTask, getActiveStrategy, getTask, getTasksSince, putTask, updateDailyLog, updateProfile, updateTask } from "@/lib/data/repo";
import { suggestFollowup } from "@/lib/domain/followup";
import { addDays, localDate } from "@/lib/domain/time";
import type { Mode, TaskKind } from "@/lib/domain/types";
import { elapsedSeconds, outcomeFrom, parseAdjustment, parseKind, parseSource, taskFieldsFrom } from "@/lib/forms";
import { refineFollowup, type RefineResult } from "@/lib/ai/followup";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function ctx() {
  const { supabase, user } = await requireUser();
  const profile = await ensureProfile(supabase, user.id);
  const today = localDate(new Date(), profile.timezone);
  return { supabase, user, profile, today };
}

function done(): ActionResult {
  revalidatePath("/today");
  revalidatePath("/records");
  return { ok: true };
}

export async function confirmPlan(fd: FormData): Promise<ActionResult> {
  const { supabase, user, profile, today } = await ctx();
  await ensureDailyLog(supabase, user.id, today, profile.current_mode, false);

  const kinds: TaskKind[] = ["reality", "long_term"];
  // 只有标记为可选的一类才能跳过；可选时以复选框是否勾选为准
  const parsed = kinds.map((kind) => ({
    kind,
    include: fd.get(`${kind}.optional`) !== "1" || fd.get(`${kind}.include`) === "on",
    fields: taskFieldsFrom(fd, `${kind}.`),
  }));
  for (const p of parsed) {
    if (p.include && !p.fields.success) return { ok: false, error: `${p.kind === "reality" ? "现实责任" : "长期积累"}：${p.fields.error.issues[0]?.message ?? "内容有误"}` };
  }

  for (const p of parsed) {
    const current = await findActiveTask(supabase, today, p.kind);
    if (current && current.status !== "planned") continue; // 已记录结果的任务保持原样
    if (p.include && p.fields.success) {
      const res = await putTask(supabase, user.id, today, {
        ...p.fields.data,
        kind: p.kind,
        carried_from_task_id: (fd.get(`${p.kind}.carried_from_task_id`) as string) || null,
        adjustment: parseAdjustment(fd.get(`${p.kind}.adjustment`)),
        source: parseSource(fd.get(`${p.kind}.source`)),
      });
      if (!res.ok) return { ok: false, error: res.reason };
    } else if (!p.include) {
      // 用户选择今天不安排这一类：已有的待执行任务改为合理延后到明天，保留继承关系
      const { data: existing } = await supabase.from("tasks").select("id,status").eq("local_date", today).eq("kind", p.kind).eq("status", "planned").maybeSingle();
      if (existing) await updateTask(supabase, existing.id, { status: "deferred", defer_to: addDays(today, 1), outcome_recorded_at: new Date().toISOString() });
    }
  }

  await updateDailyLog(supabase, today, { plan_confirmed_at: new Date().toISOString(), plan_seconds: elapsedSeconds(fd.get("opened_at")) });
  return done();
}

export async function editTask(fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const id = String(fd.get("task_id") ?? "");
  const task = await getTask(supabase, id);
  if (!task) return { ok: false, error: "找不到这个任务" };
  const fields = taskFieldsFrom(fd);
  if (!fields.success) return { ok: false, error: fields.error.issues[0]?.message ?? "内容有误" };
  await updateTask(supabase, id, fields.data);
  return done();
}

export async function startTask(fd: FormData): Promise<void> {
  const { supabase } = await ctx();
  const id = String(fd.get("task_id") ?? "");
  await supabase.from("tasks").update({ started_at: new Date().toISOString() }).eq("id", id).is("started_at", null);
  done();
}

export async function recordOutcome(fd: FormData): Promise<ActionResult> {
  const { supabase, today } = await ctx();
  const parsed = outcomeFrom(fd);
  if (!parsed.success) return { ok: false, error: "请选择执行结果" };
  const o = parsed.data;
  const task = await getTask(supabase, o.task_id);
  if (!task) return { ok: false, error: "找不到这个任务" };

  await updateTask(supabase, task.id, {
    status: o.status,
    output_level: o.output_level,
    did_minimum_only: o.did_minimum_only,
    result_note: o.result_note,
    obstacle: o.obstacle,
    obstacle_note: o.obstacle_note,
    defer_to: o.status === "deferred" ? (o.defer_to ?? addDays(today, 1)) : null,
    outcome_recorded_at: new Date().toISOString(),
    followup_decision: null,
  });
  const sec = elapsedSeconds(fd.get("opened_at"));
  if (sec !== null && task.local_date === today) await updateDailyLog(supabase, today, { review_seconds: sec });
  return done();
}

export async function setMode(fd: FormData): Promise<void> {
  const { supabase, user, profile, today } = await ctx();
  const mode = String(fd.get("mode")) as Mode;
  if (!["normal", "emergency", "recovery"].includes(mode) || mode === profile.current_mode) return;
  await updateProfile(supabase, user.id, { current_mode: mode, mode_changed_at: new Date().toISOString() });
  await ensureDailyLog(supabase, user.id, today, mode, false);
  await updateDailyLog(supabase, today, { mode });
  done();
}

export async function setDayState(fd: FormData): Promise<void> {
  const { supabase, user, profile, today } = await ctx();
  await ensureDailyLog(supabase, user.id, today, profile.current_mode, false);
  const energy = Number(fd.get("energy"));
  const patch: Record<string, unknown> = {};
  if ([1, 2, 3].includes(energy)) patch.energy = energy;
  if (fd.has("unwell")) patch.unwell = fd.get("unwell") === "true";
  if (Object.keys(patch).length) await updateDailyLog(supabase, today, patch);
  done();
}

export async function acceptFollowup(fd: FormData): Promise<ActionResult> {
  const { supabase, user, today } = await ctx();
  const source = await getTask(supabase, String(fd.get("task_id") ?? ""));
  if (!source) return { ok: false, error: "找不到原任务" };
  const kind = parseKind(fd.get("kind")) ?? source.kind;
  const fields = taskFieldsFrom(fd);
  if (!fields.success) return { ok: false, error: fields.error.issues[0]?.message ?? "内容有误" };
  const date = String(fd.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return { ok: false, error: "请选择今天或以后的日期" };

  const aiId = (fd.get("ai_suggestion_id") as string) || null;
  const aiUsed = Boolean(aiId) && fd.get("ai_used") === "1";
  let decision: "accepted" | "modified" = fd.get("edited") === "1" ? "modified" : "accepted";
  if (aiId && !aiUsed) {
    // 看过 AI 建议但选择了规则版本：记为拒绝，用于评估 AI 建议的采纳率
    await supabase.from("ai_suggestions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", aiId).eq("status", "pending");
  }
  if (aiId && aiUsed) {
    const { data: ai } = await supabase.from("ai_suggestions").select("output").eq("id", aiId).maybeSingle();
    const next = (ai?.output as { next_task?: { title: string; first_step: string; minimum_action: string } } | null)?.next_task;
    const same = next && next.title === fields.data.title && next.first_step === (fields.data.first_step ?? "") && next.minimum_action === (fields.data.minimum_action ?? "");
    decision = same ? "accepted" : "modified";
    await supabase.from("ai_suggestions").update({ status: decision, decided_at: new Date().toISOString() }).eq("id", aiId);
  }

  const res = await putTask(supabase, user.id, date, {
    ...fields.data,
    kind,
    carried_from_task_id: source.id,
    adjustment: parseAdjustment(fd.get("adjustment")),
    source: aiUsed ? "ai_suggestion" : "rule_suggestion",
  }, "followup");
  if (!res.ok) return { ok: false, error: res.reason };
  await updateTask(supabase, source.id, { followup_decision: decision, followup_decided_at: new Date().toISOString() } as never);
  revalidatePath("/today");
  revalidatePath("/records");
  return { ok: true, message: date === today ? "已安排到今天" : `已安排到 ${date}` };
}

export async function rejectFollowup(fd: FormData): Promise<ActionResult> {
  const { supabase } = await ctx();
  const id = String(fd.get("task_id") ?? "");
  const decision = fd.get("acknowledge") === "1" ? "acknowledged" : "rejected";
  await updateTask(supabase, id, { followup_decision: decision, followup_decided_at: new Date().toISOString() } as never);
  const aiId = (fd.get("ai_suggestion_id") as string) || null;
  if (aiId) await supabase.from("ai_suggestions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", aiId);
  return done();
}

export async function refineWithAi(taskId: string): Promise<RefineResult> {
  const { supabase, user, profile, today } = await ctx();
  const task = await getTask(supabase, taskId);
  if (!task) return { ok: false, message: "找不到这个任务" };
  const [history, strategy] = await Promise.all([getTasksSince(supabase, addDays(today, -90)), getActiveStrategy(supabase)]);
  const rule = suggestFollowup(task, history, today);
  return refineFollowup(supabase, user.id, { task, history, rule, mode: profile.current_mode, today, strategy: strategy.content });
}
