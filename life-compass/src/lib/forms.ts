// 表单解析与校验：所有用户输入在服务端再校验一次。
import { z } from "zod";
import type { Adjustment, TaskKind, TaskSource } from "./domain/types";
import { ADJUSTMENTS } from "./ai/provider";

const optText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const optTime = z
  .string()
  .optional()
  .transform((v) => (v && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : null));

const optDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const TaskFieldsSchema = z.object({
  title: z.string().trim().min(1, "请填写任务").max(500),
  start_time: optTime,
  place: optText(200),
  first_step: optText(500),
  full_goal: optText(1000),
  minimum_action: optText(500),
  due_date: optDate,
  is_original_work: z.boolean(),
});

export type TaskFields = z.infer<typeof TaskFieldsSchema>;

export function taskFieldsFrom(fd: FormData, prefix = ""): z.ZodSafeParseResult<TaskFields> {
  const get = (k: string) => {
    const v = fd.get(prefix + k);
    return typeof v === "string" ? v : undefined;
  };
  return TaskFieldsSchema.safeParse({
    title: get("title") ?? "",
    start_time: get("start_time"),
    place: get("place"),
    first_step: get("first_step"),
    full_goal: get("full_goal"),
    minimum_action: get("minimum_action"),
    due_date: get("due_date"),
    is_original_work: fd.get(prefix + "is_original_work") === "on",
  });
}

export const OutcomeSchema = z
  .object({
    task_id: z.string().uuid(),
    status: z.enum(["done", "partial", "not_started", "cancelled", "deferred"]),
    output_level: z.enum(["thinking", "planning", "preparing", "executing", "delivered", "result"]).nullable(),
    did_minimum_only: z.boolean(),
    result_note: optText(2000),
    obstacle: z.enum(["too_big", "bad_time", "resource_conflict", "no_first_step", "health_emotion", "need_external", "not_worth", "other"]).nullable(),
    obstacle_note: optText(1000),
    defer_to: optDate,
  })
  .transform((o) => ({
    ...o,
    // 只保留与状态相符的字段，避免前端残留的选择被写入
    output_level: o.status === "done" || o.status === "partial" ? o.output_level : null,
    did_minimum_only: o.status === "done" ? o.did_minimum_only : null,
    obstacle: o.status === "not_started" || o.status === "partial" ? o.obstacle : null,
    defer_to: o.status === "deferred" ? o.defer_to : null,
  }));

export function outcomeFrom(fd: FormData) {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v ? v : null;
  };
  return OutcomeSchema.safeParse({
    task_id: s("task_id") ?? "",
    status: s("status") ?? "",
    output_level: s("output_level"),
    did_minimum_only: fd.get("did_minimum_only") === "on",
    result_note: s("result_note") ?? undefined,
    obstacle: s("obstacle"),
    obstacle_note: s("obstacle_note") ?? undefined,
    defer_to: s("defer_to") ?? undefined,
  });
}

export function parseAdjustment(v: FormDataEntryValue | null): Adjustment {
  return (ADJUSTMENTS as readonly string[]).includes(String(v)) ? (String(v) as Adjustment) : "none";
}

export function parseSource(v: FormDataEntryValue | null): TaskSource {
  return ["user", "carry_over", "strategy_default", "rule_suggestion", "ai_suggestion"].includes(String(v)) ? (String(v) as TaskSource) : "user";
}

export function parseKind(v: FormDataEntryValue | null): TaskKind | null {
  return v === "reality" || v === "long_term" ? v : null;
}

/** 表单打开到提交的秒数，用于评估「记录负担」。异常值丢弃。 */
export function elapsedSeconds(v: FormDataEntryValue | null): number | null {
  const start = Number(v);
  if (!Number.isFinite(start) || start <= 0) return null;
  const sec = Math.round((Date.now() - start) / 1000);
  return sec >= 0 && sec <= 3600 ? sec : null;
}
