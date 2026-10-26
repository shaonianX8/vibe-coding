// 最近 7 天的确定性小结。只使用真实记录，没有数据就说没有数据。

import { lastNDays } from "./time";
import { adjustmentStats, isOriginalDelivery } from "./history";
import type { Adjustment, DailyLog, Obstacle, Task } from "./types";
import { ADJUSTMENT_LABEL, OBSTACLE_LABEL } from "./types";

export interface DayRow {
  date: string;
  log: DailyLog | null;
  tasks: Task[];
}

export interface WeekSummary {
  days: DayRow[];
  recordedDays: number;
  reality: { planned: number; done: number; partial: number };
  longTerm: { planned: number; done: number; partial: number };
  originalDeliveries: number;
  topObstacles: { obstacle: Obstacle; label: string; count: number }[];
  workingAdjustments: { adjustment: Adjustment; label: string; tried: number; succeeded: number }[];
  hasData: boolean;
}

export function summarizeWeek(today: string, tasks: Task[], logs: DailyLog[]): WeekSummary {
  const dates = lastNDays(today, 7);
  const inRange = tasks.filter((t) => t.local_date >= dates[0] && t.local_date <= today && t.status !== "cancelled");
  const days = dates
    .map((date) => ({ date, log: logs.find((l) => l.local_date === date) ?? null, tasks: inRange.filter((t) => t.local_date === date) }))
    .reverse();

  const count = (kind: Task["kind"]) => {
    const ts = inRange.filter((t) => t.kind === kind);
    return { planned: ts.length, done: ts.filter((t) => t.status === "done").length, partial: ts.filter((t) => t.status === "partial").length };
  };

  const obstacleCounts = new Map<Obstacle, number>();
  for (const t of inRange) if (t.status === "not_started" && t.obstacle) obstacleCounts.set(t.obstacle, (obstacleCounts.get(t.obstacle) ?? 0) + 1);

  const working = [...adjustmentStats(tasks).values()]
    .filter((r) => r.tried >= 1 && r.succeeded >= 1)
    .sort((a, b) => b.succeeded / b.tried - a.succeeded / a.tried)
    .map((r) => ({ ...r, label: ADJUSTMENT_LABEL[r.adjustment] }));

  return {
    days,
    recordedDays: days.filter((d) => d.tasks.some((t) => t.outcome_recorded_at)).length,
    reality: count("reality"),
    longTerm: count("long_term"),
    originalDeliveries: inRange.filter(isOriginalDelivery).length,
    topObstacles: [...obstacleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([obstacle, n]) => ({ obstacle, label: OBSTACLE_LABEL[obstacle], count: n })),
    workingAdjustments: working,
    hasData: inRange.length > 0,
  };
}
