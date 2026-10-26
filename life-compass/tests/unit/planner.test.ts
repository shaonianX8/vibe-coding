import { describe, expect, it } from "vitest";
import { planToday } from "@/lib/domain/planner";
import { suggestMode } from "@/lib/domain/mode";
import { STRATEGY_TEMPLATE } from "@/lib/strategy/template";
import { log, task } from "../helpers/factory";

const today = "2026-10-26";
const focus = STRATEGY_TEMPLATE.quarterFocus;

describe("生成今天的两件关键任务", () => {
  it("没有历史时，用季度重点生成一件现实责任和一件长期积累", () => {
    const plan = planToday({ today, mode: "normal", tasks: [], focus });
    expect(plan.reality.draft?.title).toBe(focus.reality.goal);
    expect(plan.long_term.draft?.title).toBe(focus.longTerm.goal);
    expect(plan.long_term.draft?.is_original_work).toBe(true);
    expect(plan.reality.draft?.source).toBe("strategy_default");
  });

  it("今天已保存的任务优先显示，不重复生成", () => {
    const saved = task({ local_date: today, kind: "reality", title: "交稿" });
    const plan = planToday({ today, mode: "normal", tasks: [saved], focus });
    expect(plan.reality.existing?.id).toBe(saved.id);
    expect(plan.reality.draft).toBeNull();
  });

  it("昨天部分完成的任务被继承", () => {
    const y = task({ local_date: "2026-10-25", kind: "long_term", title: "论点A", status: "partial" });
    const plan = planToday({ today, mode: "normal", tasks: [y], focus });
    expect(plan.long_term.draft?.title).toBe("论点A");
    expect(plan.long_term.draft?.source).toBe("carry_over");
    expect(plan.long_term.draft?.carried_from_task_id).toBe(y.id);
  });

  it("昨天完成了，就回到季度重点", () => {
    const y = task({ local_date: "2026-10-25", kind: "reality", status: "done" });
    expect(planToday({ today, mode: "normal", tasks: [y], focus }).reality.draft?.source).toBe("strategy_default");
  });

  it("超过 7 天的旧任务不再自动继承", () => {
    const old = task({ local_date: "2026-10-10", kind: "reality", status: "partial" });
    expect(planToday({ today, mode: "normal", tasks: [old], focus }).reality.draft?.source).toBe("strategy_default");
  });

  it("延后到未来的任务今天不出现，并给出说明", () => {
    const d = task({ local_date: "2026-10-25", kind: "reality", status: "deferred", defer_to: "2026-10-28", title: "报税" });
    const plan = planToday({ today, mode: "normal", tasks: [d], focus });
    expect(plan.reality.hint).toContain("2026-10-28");
  });

  it("下一步建议已采纳并排到以后的日期：今天不重复继承", () => {
    const y = task({ local_date: "2026-10-25", kind: "reality", status: "partial", followup_decision: "accepted" });
    const later = task({ local_date: "2026-10-28", kind: "reality", carried_from_task_id: y.id });
    const plan = planToday({ today, mode: "normal", tasks: [y, later], focus });
    expect(plan.reality.draft?.source).toBe("strategy_default");
  });

  it("用户拒绝了下一步建议：不自动继承，并说明原因", () => {
    const y = task({ local_date: "2026-10-25", kind: "long_term", status: "not_started", followup_decision: "rejected", title: "旧论点" });
    const plan = planToday({ today, mode: "normal", tasks: [y], focus });
    expect(plan.long_term.draft?.source).toBe("strategy_default");
    expect(plan.long_term.hint).toContain("没有采用后续建议");
  });

  it("特别测试：用户主动安排休息（恢复模式）时只要求最低行动", () => {
    const plan = planToday({ today, mode: "recovery", tasks: [], focus });
    expect(plan.reality.draft?.full_goal).toBe(focus.reality.minimum);
    expect(plan.long_term.optional).toBe(true);
    expect(plan.reality.hint).toContain("休息");
  });

  it("紧急模式：长期积累变为可选", () => {
    const plan = planToday({ today, mode: "emergency", tasks: [], focus });
    expect(plan.long_term.optional).toBe(true);
    expect(plan.reality.optional).toBe(false);
  });
});

describe("模式建议（只建议，不切换）", () => {
  it("特别测试：健康状态不佳时建议恢复模式", () => {
    const s = suggestMode({ current: "normal", modeChangedOn: "2026-10-01", today, todayLog: log({ local_date: today, unwell: true }), recentLogs: [], tasks: [] });
    expect(s?.suggested).toBe("recovery");
  });

  it("现实任务两天内到期时建议紧急模式", () => {
    const due = task({ local_date: today, kind: "reality", due_date: "2026-10-27", title: "还款" });
    const s = suggestMode({ current: "normal", modeChangedOn: "2026-10-01", today, todayLog: null, recentLogs: [], tasks: [due] });
    expect(s?.suggested).toBe("emergency");
  });

  it("紧急模式超过 7 天时建议确认是否回到正常", () => {
    const s = suggestMode({ current: "emergency", modeChangedOn: "2026-10-15", today, todayLog: null, recentLogs: [], tasks: [] });
    expect(s?.suggested).toBe("normal");
  });

  it("没有理由时不打扰", () => {
    expect(suggestMode({ current: "normal", modeChangedOn: "2026-10-20", today, todayLog: log({ local_date: today, energy: 2 }), recentLogs: [], tasks: [] })).toBeNull();
  });
});
