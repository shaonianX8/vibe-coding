// 生成今天的两件关键任务：一件现实责任，一件长期积累。
// 顺序：今天已保存的任务 > 继承最近未完成的任务 > 当前季度重点的默认任务。

import { daysBetween, formatCnDate } from "./time";
import { latestBefore } from "./history";
import { buildNextDraft, suggestFollowup } from "./followup";
import type { Mode, StrategyContent, Task, TaskDraft, TaskKind } from "./types";
import { STATUS_LABEL } from "./types";

export const CARRY_WINDOW_DAYS = 7;

export interface PlanSlot {
  kind: TaskKind;
  existing: Task | null;
  draft: TaskDraft | null;
  optional: boolean;
  hint: string | null;
}

export interface PlannerInput {
  today: string;
  mode: Mode;
  tasks: Task[];
  focus: StrategyContent["quarterFocus"] | null;
}

function defaultDraft(kind: TaskKind, focus: PlannerInput["focus"]): TaskDraft | null {
  const item = kind === "reality" ? focus?.reality : focus?.longTerm;
  if (!item || !item.goal.trim()) return null;
  return {
    kind,
    title: item.goal,
    start_time: null,
    place: null,
    first_step: item.first_step || null,
    full_goal: item.goal,
    minimum_action: item.minimum || null,
    due_date: null,
    is_original_work: kind === "long_term",
    carried_from_task_id: null,
    adjustment: "none",
    source: "strategy_default",
    origin_note: `来自当前季度重点：${focus?.label ?? ""}`.trim(),
  };
}

function carryDraft(prev: Task, input: PlannerInput): { draft: TaskDraft | null; hint: string | null } {
  const age = daysBetween(prev.local_date, input.today);
  if (age > CARRY_WINDOW_DAYS) return { draft: null, hint: null };
  const when = formatCnDate(prev.local_date);
  // 用户已经处理过下一步建议：采纳的任务已排在它自己的日期上，拒绝的不再自动继承
  if (prev.followup_decision === "accepted" || prev.followup_decision === "modified") return { draft: null, hint: null };
  if (prev.followup_decision === "rejected" && (prev.status === "partial" || prev.status === "not_started")) {
    return { draft: null, hint: `${when}的「${prev.title}」没有采用后续建议，今天不自动继承` };
  }

  switch (prev.status) {
    case "partial":
    case "not_started": {
      const s = suggestFollowup(prev, input.tasks, input.today);
      if (!s.nextDraft) return { draft: null, hint: `${when}的任务${STATUS_LABEL[prev.status]}，建议重新评估是否继续` };
      return {
        draft: { ...s.nextDraft, source: "carry_over", origin_note: `继承自${when}（${STATUS_LABEL[prev.status]}）。${s.nextDraft.origin_note ?? ""}` },
        hint: null,
      };
    }
    case "planned": {
      const d = buildNextDraft(prev, "none", input.tasks);
      return { draft: d && { ...d, source: "carry_over", origin_note: `${when}的任务没有记录结果，先顺延过来` }, hint: null };
    }
    case "deferred": {
      if (prev.defer_to && prev.defer_to > input.today) return { draft: null, hint: `「${prev.title}」已延后到 ${prev.defer_to}` };
      const d = buildNextDraft(prev, "none", input.tasks);
      return { draft: d && { ...d, source: "carry_over", origin_note: `${when}合理延后的任务` }, hint: null };
    }
    default:
      return { draft: null, hint: null };
  }
}

function applyMode(slot: PlanSlot, mode: Mode): PlanSlot {
  if (!slot.draft) return slot;
  if (mode === "recovery") {
    return {
      ...slot,
      optional: slot.kind === "long_term",
      draft: {
        ...slot.draft,
        full_goal: slot.draft.minimum_action || slot.draft.full_goal,
        adjustment: slot.draft.adjustment === "none" ? "recovery_minimum" : slot.draft.adjustment,
      },
      hint: "恢复模式：今天只要求最低行动，休息也是计划的一部分。",
    };
  }
  if (mode === "emergency" && slot.kind === "long_term") {
    return { ...slot, optional: true, hint: "紧急模式：长期积累可以只做最低行动，或者今天先不安排。" };
  }
  return slot;
}

export function planToday(input: PlannerInput): Record<TaskKind, PlanSlot> {
  const build = (kind: TaskKind): PlanSlot => {
    const existing = input.tasks.find((t) => t.kind === kind && t.local_date === input.today && t.status !== "cancelled") ?? null;
    if (existing) return { kind, existing, draft: null, optional: false, hint: null };

    const prev = latestBefore(input.tasks, kind, input.today);
    const carried = prev ? carryDraft(prev, input) : { draft: null, hint: null };
    const draft = carried.draft ?? defaultDraft(kind, input.focus);
    const slot: PlanSlot = { kind, existing: null, draft, optional: false, hint: carried.hint };
    return applyMode(slot, input.mode);
  };
  return { reality: build("reality"), long_term: build("long_term") };
}
