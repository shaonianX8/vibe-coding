// 领域类型：与数据库字段一一对应，业务逻辑只依赖这些类型，不依赖 Supabase。

export type Mode = "normal" | "emergency" | "recovery";
export type TaskKind = "reality" | "long_term";
export type TaskStatus = "planned" | "done" | "partial" | "not_started" | "cancelled" | "deferred";
export type OutputLevel = "thinking" | "planning" | "preparing" | "executing" | "delivered" | "result";
export type Obstacle =
  | "too_big"
  | "bad_time"
  | "resource_conflict"
  | "no_first_step"
  | "health_emotion"
  | "need_external"
  | "not_worth"
  | "other";
export type Adjustment =
  | "none"
  | "continue"
  | "carry_remaining"
  | "shrink"
  | "reschedule"
  | "define_first_step"
  | "external_commitment"
  | "recovery_minimum"
  | "reprioritize"
  | "review_goal";
export type TaskSource = "user" | "carry_over" | "strategy_default" | "rule_suggestion" | "ai_suggestion";

export interface Task {
  id: string;
  local_date: string; // YYYY-MM-DD，用户时区
  kind: TaskKind;
  title: string;
  start_time: string | null; // HH:MM 或 HH:MM:SS
  place: string | null;
  first_step: string | null;
  full_goal: string | null;
  minimum_action: string | null;
  due_date: string | null;
  is_original_work: boolean;
  status: TaskStatus;
  started_at: string | null;
  output_level: OutputLevel | null;
  did_minimum_only: boolean | null;
  result_note: string | null;
  obstacle: Obstacle | null;
  obstacle_note: string | null;
  defer_to: string | null;
  carried_from_task_id: string | null;
  adjustment: Adjustment;
  source: TaskSource;
  outcome_recorded_at: string | null;
  followup_decision: "accepted" | "modified" | "rejected" | "acknowledged" | null;
  created_at: string;
}

/** 新任务草稿：还没保存进数据库 */
export interface TaskDraft {
  kind: TaskKind;
  title: string;
  start_time: string | null;
  place: string | null;
  first_step: string | null;
  full_goal: string | null;
  minimum_action: string | null;
  due_date: string | null;
  is_original_work: boolean;
  carried_from_task_id: string | null;
  adjustment: Adjustment;
  source: TaskSource;
  /** 给用户看的来源说明，例如：继承自 10月25日 部分完成的任务 */
  origin_note: string | null;
}

export interface DailyLog {
  local_date: string;
  mode: Mode;
  energy: 1 | 2 | 3 | null;
  unwell: boolean;
  plan_confirmed_at: string | null;
}

export interface Profile {
  user_id: string;
  timezone: string;
  reminder_time: string;
  reminders_enabled: boolean;
  reminders_paused_until: string | null;
  current_mode: Mode;
  mode_changed_at: string;
}

export interface FocusItem {
  goal: string;
  first_step: string;
  minimum: string;
}

export interface StrategyContent {
  endgame: string;
  principles: string[];
  strategy2036: string;
  researchTheme: string;
  researchAreas: string[];
  capitals: { key: string; name: string; description: string }[];
  necessaryConditions: string[];
  stage: { name: string; period: string; priorities: string[] };
  quarterFocus: { label: string; reality: FocusItem; longTerm: FocusItem; health: string };
  mainConstraint: { statement: string; why: string; evidence: string } | null;
}

export const MODE_LABEL: Record<Mode, string> = {
  normal: "正常模式",
  emergency: "紧急模式",
  recovery: "恢复模式",
};

export const KIND_LABEL: Record<TaskKind, string> = {
  reality: "现实责任",
  long_term: "长期积累",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: "待执行",
  done: "已完成",
  partial: "部分完成",
  not_started: "未开始",
  cancelled: "主动取消",
  deferred: "合理延后",
};

export const OUTPUT_LABEL: Record<OutputLevel, string> = {
  thinking: "思考",
  planning: "计划",
  preparing: "准备",
  executing: "执行",
  delivered: "完成交付",
  result: "获得结果",
};

export const OBSTACLE_LABEL: Record<Obstacle, string> = {
  too_big: "任务太大",
  bad_time: "时间不合适",
  resource_conflict: "和别的事冲突",
  no_first_step: "不知道第一步",
  health_emotion: "身体或情绪状态",
  need_external: "缺少外部反馈或协作",
  not_worth: "目标可能不值得做了",
  other: "其他",
};

export const ADJUSTMENT_LABEL: Record<Adjustment, string> = {
  none: "不调整",
  continue: "继续下一步",
  carry_remaining: "继承剩余部分",
  shrink: "缩小任务",
  reschedule: "换个时间",
  define_first_step: "先写清第一步",
  external_commitment: "引入外部承诺",
  recovery_minimum: "只做最低行动",
  reprioritize: "重新排优先级",
  review_goal: "重新评估目标",
};

/** 交付级产出：只有这两级算作品交付 */
export const DELIVERY_LEVELS: OutputLevel[] = ["delivered", "result"];
