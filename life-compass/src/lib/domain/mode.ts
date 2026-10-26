// 模式只能由用户切换。这里只给出建议和理由。

import { addDays, daysBetween } from "./time";
import type { DailyLog, Mode, Task } from "./types";
import { MODE_LABEL } from "./types";

export interface ModeSuggestion {
  suggested: Mode;
  reason: string;
}

export function suggestMode(input: {
  current: Mode;
  modeChangedOn: string; // 本地日期
  today: string;
  todayLog: DailyLog | null;
  recentLogs: DailyLog[];
  tasks: Task[];
}): ModeSuggestion | null {
  const { current, today, todayLog } = input;

  if (current !== "recovery" && todayLog && (todayLog.unwell || todayLog.energy === 1)) {
    return { suggested: "recovery", reason: todayLog.unwell ? "你记录了身体不适。" : "你记录的精力偏低。" };
  }

  const soon = input.tasks.find(
    (t) => t.kind === "reality" && t.due_date && t.status !== "done" && t.status !== "cancelled" && t.due_date >= today && daysBetween(today, t.due_date) <= 2,
  );
  if (current === "normal" && soon) {
    return { suggested: "emergency", reason: `「${soon.title}」将在 ${soon.due_date} 到期。` };
  }

  const days = daysBetween(input.modeChangedOn, today);
  if (current === "emergency" && days >= 7) {
    return { suggested: "normal", reason: `${MODE_LABEL.emergency}已持续 ${days} 天，确认紧急状态是否仍然成立。` };
  }

  if (current === "recovery") {
    const lastTwo = [addDays(today, -1), today].map((d) => input.recentLogs.find((l) => l.local_date === d));
    if (lastTwo.every((l) => l && l.energy === 3 && !l.unwell)) {
      return { suggested: "normal", reason: "最近两天精力都不错，可以考虑回到正常模式。" };
    }
  }
  return null;
}
