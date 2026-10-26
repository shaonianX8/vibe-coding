// 第一层预警：确定性规则。每条预警都给出 事实、证据、可能解释、未知、最小调整、复查日期。
// 用户可以标注预警不准确，系统据此暂停并提高同类预警的门槛。

import { addDays, daysBetween } from "./time";
import { consecutiveNotStarted, isOriginalDelivery, lastOriginalDelivery } from "./history";
import type { DailyLog, Task, TaskKind } from "./types";
import { KIND_LABEL, OUTPUT_LABEL, STATUS_LABEL } from "./types";

export interface AlertEvidence {
  date: string;
  text: string;
}

export interface Alert {
  key: string;
  title: string;
  facts: string[];
  evidence: AlertEvidence[];
  explanations: string[];
  unknowns: string[];
  adjustment: string;
  recheckOn: string;
}

export interface AlertFeedback {
  alert_key: string;
  verdict: "inaccurate" | "useful";
  local_date: string;
}

export const ORIGINAL_STALL_DAYS = 14;
export const SUPPRESS_DAYS = 14;

function inaccurate(feedback: AlertFeedback[], key: string): AlertFeedback[] {
  return feedback.filter((f) => f.alert_key === key && f.verdict === "inaccurate");
}

function suppressed(feedback: AlertFeedback[], key: string, today: string): boolean {
  return inaccurate(feedback, key).some((f) => daysBetween(f.local_date, today) < SUPPRESS_DAYS);
}

/** 被标注不准确的次数越多，原创停滞的判断门槛越高（每次 +7 天，最多 +14 天） */
export function originalStallThreshold(feedback: AlertFeedback[]): number {
  return ORIGINAL_STALL_DAYS + 7 * Math.min(inaccurate(feedback, "original_stalled").length, 2);
}

function originalStalled(today: string, tasks: Task[], logs: DailyLog[], feedback: AlertFeedback[]): Alert | null {
  if (tasks.length === 0) return null;
  const threshold = originalStallThreshold(feedback);
  const firstDate = tasks.reduce((min, t) => (t.local_date < min ? t.local_date : min), tasks[0].local_date);
  // 数据不足以判断时不报警
  if (daysBetween(firstDate, today) < threshold - 1) return null;

  const windowStart = addDays(today, -(threshold - 1));
  const inWindow = tasks.filter((t) => t.local_date >= windowStart && t.local_date <= today);
  if (inWindow.some(isOriginalDelivery)) return null;

  const last = lastOriginalDelivery(tasks);
  const longTerm = inWindow.filter((t) => t.kind === "long_term");
  const prep = longTerm.filter((t) => t.output_level && ["thinking", "planning", "preparing"].includes(t.output_level));
  const squeezed = longTerm.filter((t) => t.status === "not_started" && t.obstacle === "resource_conflict");
  const specialDays = logs.filter((l) => l.local_date >= windowStart && l.mode !== "normal").length;

  const facts = [
    last ? `上一次原创交付是 ${last.local_date}，距今 ${daysBetween(last.local_date, today)} 天。` : `系统里还没有原创交付记录（统计了最近 ${threshold} 天）。`,
    `最近 ${threshold} 天安排了 ${longTerm.length} 次长期积累任务。`,
  ];
  const explanations: string[] = [];
  if (prep.length >= 3) explanations.push(`准备类产出有 ${prep.length} 次（思考、计划或准备），可能存在反复准备、迟迟不交付的情况。`);
  if (squeezed.length >= 2) explanations.push(`长期任务有 ${squeezed.length} 次因为和别的事冲突没有开始，可能被现实事务持续挤占。`);
  if (specialDays >= 7) explanations.push(`这段时间有 ${specialDays} 天处于紧急或恢复模式，暂停创作可能是合理安排。`);
  if (longTerm.length === 0) explanations.push("这段时间没有安排长期积累任务。");
  if (explanations.length === 0) explanations.push("任务可能偏大，或者缺少外部截止时间和读者反馈。");

  return {
    key: "original_stalled",
    title: last ? `已经 ${daysBetween(last.local_date, today)} 天没有原创交付` : `最近 ${threshold} 天没有原创交付记录`,
    facts,
    evidence: longTerm.map((t) => ({
      date: t.local_date,
      text: `${t.title}：${STATUS_LABEL[t.status]}${t.output_level ? `，产出为${OUTPUT_LABEL[t.output_level]}` : ""}${t.is_original_work ? "" : "（未标记为原创）"}`,
    })),
    explanations,
    unknowns: ["系统不知道你是否有没记录在这里的写作或发布。", "不清楚这段时间是否有客户交付占用了主要精力。"],
    adjustment: "把下一次长期任务定为一个交付级的小作品，例如一篇 300 字的短观点，写完就发布。",
    recheckOn: addDays(today, 7),
  };
}

function notStartedStreak(kind: TaskKind, today: string, tasks: Task[]): Alert | null {
  const streak = consecutiveNotStarted(tasks, kind, today);
  if (streak < 3) return null;
  const recent = tasks
    .filter((t) => t.kind === kind && t.status === "not_started" && t.local_date <= today)
    .sort((a, b) => (a.local_date < b.local_date ? 1 : -1))
    .slice(0, streak);
  return {
    key: `not_started_${kind}`,
    title: `${KIND_LABEL[kind]}连续 ${streak} 次没有开始`,
    facts: [`最近 ${streak} 次${KIND_LABEL[kind]}任务都记录为未开始。`],
    evidence: recent.map((t) => ({ date: t.local_date, text: `${t.title}${t.obstacle_note ? `：${t.obstacle_note}` : ""}` })),
    explanations: ["任务设计和当前资源可能不匹配：太大、时间不对、第一步不清楚，或者缺少外部反馈。"],
    unknowns: ["不清楚这件事对你当前阶段是否仍然重要。"],
    adjustment: "下一次只安排 10 分钟的最低版本，并写清第一步；如果仍然不想做，重新评估这个目标。",
    recheckOn: addDays(today, 3),
  };
}

function emergencyTooLong(today: string, logs: DailyLog[]): Alert | null {
  let n = 0;
  for (let d = today; ; d = addDays(d, -1)) {
    const log = logs.find((l) => l.local_date === d);
    if (!log || log.mode !== "emergency") break;
    n += 1;
  }
  if (n < 14) return null;
  return {
    key: "emergency_long",
    title: `紧急模式已经持续 ${n} 天`,
    facts: [`连续 ${n} 天的记录都处于紧急模式。`],
    evidence: [],
    explanations: ["紧急状态可能仍然成立，也可能已经变成了默认状态。"],
    unknowns: ["系统不知道导致紧急的事项是否已经解除。"],
    adjustment: "确认紧急事项是否仍然存在；如果存在，每周至少保留一次长期积累的最低行动。",
    recheckOn: addDays(today, 7),
  };
}

function lowEnergy(today: string, logs: DailyLog[]): Alert | null {
  const window = logs.filter((l) => l.local_date > addDays(today, -5) && l.local_date <= today);
  const low = window.filter((l) => l.unwell || l.energy === 1);
  if (low.length < 3 || window.some((l) => l.local_date === today && l.mode === "recovery")) return null;
  return {
    key: "low_energy",
    title: "最近精力持续偏低",
    facts: [`最近 5 天里有 ${low.length} 天记录了精力偏低或身体不适。`],
    evidence: low.map((l) => ({ date: l.local_date, text: l.unwell ? "身体不适" : "精力偏低" })),
    explanations: ["可能是工作量过大、睡眠不足，或者身体需要恢复。"],
    unknowns: ["系统没有睡眠和健康检查数据。"],
    adjustment: "考虑切换到恢复模式几天，只保留最低行动。如果身体不适持续，请就医。",
    recheckOn: addDays(today, 3),
  };
}

export function computeAlerts(input: { today: string; tasks: Task[]; logs: DailyLog[]; feedback: AlertFeedback[] }): Alert[] {
  const { today, tasks, logs, feedback } = input;
  const candidates = [
    originalStalled(today, tasks, logs, feedback),
    notStartedStreak("reality", today, tasks),
    notStartedStreak("long_term", today, tasks),
    emergencyTooLong(today, logs),
    lowEnergy(today, logs),
  ];
  return candidates.filter((a): a is Alert => a !== null && !suppressed(feedback, a.key, today));
}
