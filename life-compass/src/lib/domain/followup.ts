// 记录结果之后，根据结果和障碍给出下一步。全部是确定性规则，AI 只在此基础上补充。
// 原则：任务没完成，先查条件，不下「缺乏自律」的结论。

import { addDays } from "./time";
import { adjustmentStats, bestStartTime, consecutiveNotStarted } from "./history";
import type { Adjustment, Task, TaskDraft } from "./types";
import { ADJUSTMENT_LABEL, DELIVERY_LEVELS, OBSTACLE_LABEL } from "./types";

export const ESCALATION_THRESHOLD = 3;

export interface Alternative {
  adjustment: Adjustment;
  label: string;
  record: string | null;
}

export interface FollowupSuggestion {
  headline: string;
  facts: string[];
  questions: string[];
  adjustment: Adjustment;
  nextDate: string | null;
  nextDraft: TaskDraft | null;
  escalated: boolean;
  alternatives: Alternative[];
}

const STRUCTURAL: Adjustment[] = ["shrink", "reschedule", "define_first_step", "external_commitment", "recovery_minimum", "review_goal"];

function obstacleToAdjustment(task: Task): Adjustment {
  switch (task.obstacle) {
    case "too_big":
      return "shrink";
    case "bad_time":
      return "reschedule";
    case "resource_conflict":
      return "reprioritize";
    case "no_first_step":
      return "define_first_step";
    case "health_emotion":
      return "recovery_minimum";
    case "need_external":
      return "external_commitment";
    case "not_worth":
      return "review_goal";
    default:
      return "shrink";
  }
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

/** 按某种调整方法，从原任务生成下一次的任务草稿 */
export function buildNextDraft(task: Task, adjustment: Adjustment, history: Task[]): TaskDraft | null {
  const base: TaskDraft = {
    kind: task.kind,
    title: task.title,
    start_time: task.start_time ? task.start_time.slice(0, 5) : null,
    place: task.place,
    first_step: task.first_step,
    full_goal: task.full_goal,
    minimum_action: task.minimum_action,
    due_date: task.due_date,
    is_original_work: task.is_original_work,
    carried_from_task_id: task.id,
    adjustment,
    source: "rule_suggestion",
    origin_note: null,
  };

  switch (adjustment) {
    case "review_goal":
      return null;
    case "continue": {
      const prepOnly = task.output_level !== null && !DELIVERY_LEVELS.includes(task.output_level);
      return {
        ...base,
        first_step: prepOnly && task.is_original_work ? "把已经准备好的材料，直接写成一段可以发布的文字" : "接着上次的成果，写下下一步要交付的具体内容",
        origin_note: "接着上次完成的部分继续",
      };
    }
    case "carry_remaining":
      return {
        ...base,
        first_step: task.result_note ? `从上次停下的地方继续（上次进展：${task.result_note}）` : "从上次停下的地方继续",
        origin_note: "继承上次未完成的部分，不需要重新开始",
      };
    case "shrink":
      return {
        ...base,
        full_goal: task.minimum_action || `只完成「${task.title}」中的一小块`,
        minimum_action: `只做 10 分钟：${task.first_step || "打开相关文件，写下第一句"}`,
        origin_note: "上次任务偏大，这次缩小",
      };
    case "reschedule": {
      const best = bestStartTime(history, task.kind);
      const fallback = task.start_time ? null : "10:30";
      return {
        ...base,
        start_time: best && best !== base.start_time ? best : fallback ?? base.start_time,
        origin_note: best ? `换到过去更常完成的时间（${best}）` : "换一个更可能开始的时间",
      };
    }
    case "define_first_step":
      return {
        ...base,
        first_step: null,
        origin_note: "先写清一个 2 分钟内就能开始的第一步",
      };
    case "external_commitment":
      return {
        ...base,
        first_step: "先给一个具体的人发消息，约定今天几点前给他看结果",
        origin_note: "引入外部承诺和反馈",
      };
    case "recovery_minimum":
      return {
        ...base,
        full_goal: task.minimum_action || `「${task.title}」的最低版本`,
        origin_note: "先照顾身体和状态，只保留最低行动",
      };
    case "reprioritize":
      return {
        ...base,
        full_goal: task.minimum_action || base.full_goal,
        origin_note: "和其他事冲突时，先保住一个小而固定的时段",
      };
    case "none":
      return { ...base, origin_note: "按原计划顺延" };
  }
}

function recordText(rec: { tried: number; succeeded: number } | undefined): string | null {
  if (!rec || rec.tried === 0) return null;
  return `过去用过 ${rec.tried} 次，之后完成 ${rec.succeeded} 次`;
}

export function suggestFollowup(task: Task, history: Task[], today: string): FollowupSuggestion {
  const all = history.some((t) => t.id === task.id) ? history : [...history, task];
  const stats = adjustmentStats(all.filter((t) => t.id !== task.id));
  const nextDate = laterOf(addDays(task.local_date, 1), today);
  const facts: string[] = [];
  const questions: string[] = [];

  const result = (headline: string, adjustment: Adjustment, opts: { escalated?: boolean; date?: string | null } = {}): FollowupSuggestion => {
    const date = opts.date === undefined ? nextDate : opts.date;
    const draft = date ? buildNextDraft(task, adjustment, all) : null;
    const alternatives: Alternative[] = STRUCTURAL.filter((a) => a !== adjustment)
      .map((a) => ({ adjustment: a, label: ADJUSTMENT_LABEL[a], record: recordText(stats.get(a)), rate: rate(stats.get(a)) }))
      .sort((x, y) => (y.rate ?? -1) - (x.rate ?? -1))
      .map(({ adjustment: a, label, record }) => ({ adjustment: a, label, record }));
    return {
      headline,
      facts,
      questions,
      adjustment,
      nextDate: draft ? date : null,
      nextDraft: draft,
      escalated: opts.escalated ?? false,
      alternatives,
    };
  };

  switch (task.status) {
    case "done": {
      facts.push(task.did_minimum_only ? "这次完成的是最低行动，它同样算数。" : "这次完成了计划的目标。");
      if (task.is_original_work && task.output_level && !DELIVERY_LEVELS.includes(task.output_level)) {
        facts.push("这次产出属于准备或执行阶段，还不算作品交付。下一步可以直接推向交付。");
      }
      return result("已完成。决定下一步是否继续。", "continue");
    }
    case "partial":
      facts.push("部分完成不需要从头再来，下一次直接继承剩余部分。");
      return result("部分完成。继承剩余部分。", "carry_remaining");
    case "cancelled":
      facts.push("主动取消也是一个有效决策，前提是你知道为什么取消。");
      return result("已主动取消。", "none", { date: null });
    case "deferred":
      facts.push(task.defer_to ? `已延后到 ${task.defer_to}。` : "已延后，默认顺延到下一天。");
      return result("合理延后。", "none", { date: task.defer_to ?? nextDate });
    case "planned":
      return result("还没有记录结果。", "none", { date: null });
    case "not_started":
      break;
  }

  // 未开始：先看障碍，再决定调整
  const streak = consecutiveNotStarted(all, task.kind, task.local_date);
  const primary = obstacleToAdjustment(task);
  if (task.obstacle) facts.push(`你记录的障碍：${OBSTACLE_LABEL[task.obstacle]}。`);
  else questions.push("是什么让它没有开始？选一个最接近的障碍，建议会更准确。");

  const primaryRate = rate(stats.get(primary));
  const better = [...stats.values()]
    .filter((r) => r.adjustment !== primary && STRUCTURAL.includes(r.adjustment) && r.tried >= 3 && r.succeeded / r.tried >= 0.6)
    .sort((a, b) => b.succeeded / b.tried - a.succeeded / a.tried)[0];
  if (better && (primaryRate === null || primaryRate < 0.4)) {
    facts.push(`你的记录显示「${ADJUSTMENT_LABEL[better.adjustment]}」更常奏效（${better.succeeded}/${better.tried}），可以优先考虑。`);
  }

  switch (primary) {
    case "reprioritize":
      questions.push("和它冲突的那件事，哪件对当前阶段更重要？如果另一件更重要，这里可以只保留最低行动。");
      break;
    case "define_first_step":
      questions.push("第一个动作具体是什么？最好是 2 分钟内就能开始的动作，比如打开某个文件、写下标题。");
      break;
    case "external_commitment":
      questions.push("可以找谁约定一个交付时间？一条消息就够。");
      break;
    case "review_goal":
      questions.push("这件事还值得做吗？如果不值得，主动取消也是好决策；如果值得，写下它服务于哪个长期目标。");
      break;
    case "recovery_minimum":
      questions.push("要不要把今天或明天切换到恢复模式？这由你决定。");
      break;
  }

  if (streak >= ESCALATION_THRESHOLD) {
    facts.unshift(`这件事已经连续 ${streak} 次没有开始。`);
    questions.push("重复催促没有用。逐项检查：任务是否太大？时间是否合适？是否和别的事冲突？第一步是否清楚？身体状态如何？是否需要别人参与？它还值得做吗？");
    const escalatedAdj: Adjustment = primary === "reprioritize" ? "shrink" : primary;
    return result("连续多次没有开始。需要改变任务设计，而不是再催一次。", escalatedAdj, {
      escalated: true,
      date: escalatedAdj === "review_goal" ? null : nextDate,
    });
  }

  return result("没有开始。先调整条件，再试一次。", primary, { date: primary === "review_goal" ? null : nextDate });
}

function rate(rec: { tried: number; succeeded: number } | undefined): number | null {
  if (!rec || rec.tried < 2) return null;
  return rec.succeeded / rec.tried;
}
