// 从历史任务中提取确定性的统计：连续未开始次数、调整方法的真实效果、最常成功的开始时间。

import type { Adjustment, Task, TaskKind } from "./types";
import { DELIVERY_LEVELS } from "./types";

function byDateDesc(a: Task, b: Task): number {
  if (a.local_date !== b.local_date) return a.local_date < b.local_date ? 1 : -1;
  return a.created_at < b.created_at ? 1 : -1;
}

/**
 * 某类任务从最近一次往回数，连续「未开始」的次数。
 * 没有记录结果的过去任务不算证据，跳过；完成、部分完成、延后会打断连续。
 */
export function consecutiveNotStarted(tasks: Task[], kind: TaskKind, uptoDate: string): number {
  let n = 0;
  for (const t of tasks.filter((t) => t.kind === kind && t.local_date <= uptoDate).sort(byDateDesc)) {
    if (t.status === "not_started") n += 1;
    else if (t.status === "planned" || t.status === "cancelled") continue;
    else break;
  }
  return n;
}

export interface AdjustmentRecord {
  adjustment: Adjustment;
  tried: number;
  succeeded: number;
}

/** 每种调整方法用过几次、之后完成（含部分完成）几次 */
export function adjustmentStats(tasks: Task[]): Map<Adjustment, AdjustmentRecord> {
  const stats = new Map<Adjustment, AdjustmentRecord>();
  for (const t of tasks) {
    if (t.adjustment === "none" || t.adjustment === "continue") continue;
    if (!["done", "partial", "not_started"].includes(t.status)) continue;
    const rec = stats.get(t.adjustment) ?? { adjustment: t.adjustment, tried: 0, succeeded: 0 };
    rec.tried += 1;
    if (t.status === "done" || t.status === "partial") rec.succeeded += 1;
    stats.set(t.adjustment, rec);
  }
  return stats;
}

/** 某类任务最常完成的开始时间（按整点统计），没有数据时返回 null */
export function bestStartTime(tasks: Task[], kind: TaskKind): string | null {
  const counts = new Map<number, number>();
  for (const t of tasks) {
    if (t.kind !== kind || !t.start_time) continue;
    if (t.status !== "done" && t.status !== "partial") continue;
    const h = Number(t.start_time.slice(0, 2));
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [h, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && h < best)) {
      best = h;
      bestN = n;
    }
  }
  return best === null ? null : `${String(best).padStart(2, "0")}:00`;
}

/** 是否属于原创交付：标记为原创，产出达到交付级，并且确实做了 */
export function isOriginalDelivery(t: Task): boolean {
  return (
    t.is_original_work &&
    (t.status === "done" || t.status === "partial") &&
    t.output_level !== null &&
    DELIVERY_LEVELS.includes(t.output_level)
  );
}

export function lastOriginalDelivery(tasks: Task[]): Task | null {
  return tasks.filter(isOriginalDelivery).sort(byDateDesc)[0] ?? null;
}

export function latestBefore(tasks: Task[], kind: TaskKind, date: string): Task | null {
  return tasks.filter((t) => t.kind === kind && t.local_date < date && t.status !== "cancelled").sort(byDateDesc)[0] ?? null;
}
