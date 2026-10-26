import { describe, expect, it } from "vitest";
import { suggestFollowup } from "@/lib/domain/followup";
import { consecutiveNotStarted } from "@/lib/domain/history";
import { task } from "../helpers/factory";

const today = "2026-10-26";

describe("结果之后的下一步", () => {
  it("部分完成：继承剩余部分，不要求重新开始", () => {
    const t = task({ local_date: today, status: "partial", result_note: "写完了第一段" });
    const s = suggestFollowup(t, [t], today);
    expect(s.adjustment).toBe("carry_remaining");
    expect(s.nextDate).toBe("2026-10-27");
    expect(s.nextDraft?.first_step).toContain("写完了第一段");
    expect(s.nextDraft?.carried_from_task_id).toBe(t.id);
  });

  it("未开始且任务太大：缩小任务，最低行动变成目标", () => {
    const t = task({ local_date: today, status: "not_started", obstacle: "too_big", minimum_action: "写 3 句话" });
    const s = suggestFollowup(t, [t], today);
    expect(s.adjustment).toBe("shrink");
    expect(s.nextDraft?.full_goal).toBe("写 3 句话");
    expect(s.escalated).toBe(false);
  });

  it("未开始且没写原因：先问障碍，不下自律结论", () => {
    const t = task({ local_date: today, status: "not_started" });
    const s = suggestFollowup(t, [t], today);
    expect(s.questions.join("")).toContain("障碍");
    expect(JSON.stringify(s)).not.toMatch(/自律|懒/);
  });

  it("目标可能不值得：不生成下一次任务，先重新评估", () => {
    const t = task({ local_date: today, status: "not_started", obstacle: "not_worth" });
    const s = suggestFollowup(t, [t], today);
    expect(s.adjustment).toBe("review_goal");
    expect(s.nextDraft).toBeNull();
  });

  it("主动取消：没有下一步", () => {
    const t = task({ local_date: today, status: "cancelled" });
    expect(suggestFollowup(t, [t], today).nextDraft).toBeNull();
  });

  it("合理延后：顺延到指定日期", () => {
    const t = task({ local_date: today, status: "deferred", defer_to: "2026-10-30" });
    const s = suggestFollowup(t, [t], today);
    expect(s.nextDate).toBe("2026-10-30");
  });

  it("补记昨天的结果：下一步安排在今天而不是昨天的明天之前", () => {
    const t = task({ local_date: "2026-10-24", status: "partial" });
    expect(suggestFollowup(t, [t], today).nextDate).toBe(today);
  });

  it("完成但只是准备阶段：提示还不算作品交付", () => {
    const t = task({ local_date: today, status: "done", is_original_work: true, output_level: "preparing" });
    const s = suggestFollowup(t, [t], today);
    expect(s.facts.join("")).toContain("还不算作品交付");
  });
});

describe("特别测试：任务连续三次未完成", () => {
  const history = [
    task({ local_date: "2026-10-23", status: "not_started", obstacle: "bad_time" }),
    task({ local_date: "2026-10-24", status: "not_started", obstacle: "bad_time" }),
    task({ local_date: "2026-10-25", status: "planned" }), // 未记录，不算证据也不打断
  ];
  const third = task({ local_date: today, status: "not_started", obstacle: "too_big" });

  it("连续计数跳过未记录的任务", () => {
    expect(consecutiveNotStarted([...history, third], "long_term", today)).toBe(3);
  });

  it("进入障碍分析：改变任务设计，而不是重复催促", () => {
    const s = suggestFollowup(third, [...history, third], today);
    expect(s.escalated).toBe(true);
    expect(s.headline).toContain("改变任务设计");
    expect(s.facts[0]).toContain("连续 3 次");
    expect(s.questions.some((q) => q.includes("逐项检查"))).toBe(true);
  });

  it("优先推荐有真实成功记录的调整方法", () => {
    const past = [
      task({ local_date: "2026-10-01", status: "done", adjustment: "external_commitment" }),
      task({ local_date: "2026-10-03", status: "done", adjustment: "external_commitment" }),
      task({ local_date: "2026-10-05", status: "partial", adjustment: "external_commitment" }),
      task({ local_date: "2026-10-07", status: "not_started", adjustment: "shrink" }),
      task({ local_date: "2026-10-09", status: "not_started", adjustment: "shrink" }),
      task({ local_date: "2026-10-11", status: "not_started", adjustment: "shrink" }),
    ];
    const s = suggestFollowup(third, [...past, ...history, third], today);
    expect(s.facts.join("")).toContain("引入外部承诺");
    expect(s.alternatives[0].adjustment).toBe("external_commitment");
    expect(s.alternatives[0].record).toContain("3 次");
  });
});
