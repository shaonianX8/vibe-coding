// 测试用的模拟数据工厂。模拟数据只存在于测试进程或本地测试数据库，绝不进入正式数据。
import type { DailyLog, Task } from "@/lib/domain/types";

let seq = 0;

export function task(partial: Partial<Task> & Pick<Task, "local_date">): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    kind: "long_term",
    title: `任务${seq}`,
    start_time: null,
    place: null,
    first_step: "打开草稿",
    full_goal: "写完一个论点",
    minimum_action: "写 3 句话",
    due_date: null,
    is_original_work: false,
    status: "planned",
    started_at: null,
    output_level: null,
    did_minimum_only: null,
    result_note: null,
    obstacle: null,
    obstacle_note: null,
    defer_to: null,
    carried_from_task_id: null,
    adjustment: "none",
    source: "user",
    followup_decision: null,
    outcome_recorded_at: partial.status && partial.status !== "planned" ? `${partial.local_date}T12:00:00Z` : null,
    created_at: `${partial.local_date}T02:00:00Z`,
    ...partial,
  };
}

export function log(partial: Partial<DailyLog> & Pick<DailyLog, "local_date">): DailyLog {
  return { mode: "normal", energy: null, unwell: false, plan_confirmed_at: null, ...partial };
}
