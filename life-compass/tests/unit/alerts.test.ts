import { describe, expect, it } from "vitest";
import { computeAlerts, originalStallThreshold } from "@/lib/domain/alerts";
import { addDays } from "@/lib/domain/time";
import { summarizeWeek } from "@/lib/domain/weekly";
import { log, task } from "../helpers/factory";

const today = "2026-10-26";

function days(n: number, make: (date: string, i: number) => ReturnType<typeof task>) {
  return Array.from({ length: n }, (_, i) => make(addDays(today, -i), i));
}

describe("特别测试：连续 14 天没有原创交付", () => {
  it("14 天只有准备、没有交付：触发预警，并指出可能的过度准备", () => {
    const tasks = days(14, (d) => task({ local_date: d, kind: "long_term", is_original_work: true, status: "done", output_level: "preparing" }));
    const alerts = computeAlerts({ today, tasks, logs: [], feedback: [] });
    const a = alerts.find((x) => x.key === "original_stalled");
    expect(a).toBeDefined();
    expect(a!.facts[0]).toContain("还没有原创交付记录");
    expect(a!.explanations.join("")).toContain("反复准备");
    expect(a!.evidence).toHaveLength(14);
    expect(a!.unknowns.length).toBeGreaterThan(0);
    expect(a!.recheckOn).toBe("2026-11-02");
  });

  it("窗口内有一次交付就不报警", () => {
    const tasks = days(14, (d, i) =>
      task({ local_date: d, kind: "long_term", is_original_work: true, status: "done", output_level: i === 5 ? "delivered" : "preparing" }),
    );
    expect(computeAlerts({ today, tasks, logs: [], feedback: [] }).some((a) => a.key === "original_stalled")).toBe(false);
  });

  it("数据不足 14 天时不下判断", () => {
    const tasks = days(5, (d) => task({ local_date: d, kind: "long_term", status: "not_started" }));
    expect(computeAlerts({ today, tasks, logs: [], feedback: [] }).some((a) => a.key === "original_stalled")).toBe(false);
  });

  it("未标记为原创的交付不算原创作品（例如整理 AI 工作流）", () => {
    const tasks = days(14, (d) => task({ local_date: d, kind: "long_term", is_original_work: false, status: "done", output_level: "delivered" }));
    expect(computeAlerts({ today, tasks, logs: [], feedback: [] }).some((a) => a.key === "original_stalled")).toBe(true);
  });

  it("用户标注不准确后暂停 14 天，并提高之后的判断门槛", () => {
    const tasks = days(20, (d) => task({ local_date: d, kind: "long_term", status: "not_started" }));
    const feedback = [{ alert_key: "original_stalled", verdict: "inaccurate" as const, local_date: "2026-10-20" }];
    expect(computeAlerts({ today, tasks, logs: [], feedback }).some((a) => a.key === "original_stalled")).toBe(false);
    expect(originalStallThreshold(feedback)).toBe(21);
  });
});

describe("其他规则预警", () => {
  it("连续三次未开始触发预警", () => {
    const tasks = days(3, (d) => task({ local_date: d, kind: "reality", status: "not_started" }));
    expect(computeAlerts({ today, tasks, logs: [], feedback: [] }).map((a) => a.key)).toContain("not_started_reality");
  });

  it("紧急模式持续 14 天触发预警", () => {
    const logs = Array.from({ length: 14 }, (_, i) => log({ local_date: addDays(today, -i), mode: "emergency" }));
    expect(computeAlerts({ today, tasks: [], logs, feedback: [] }).map((a) => a.key)).toContain("emergency_long");
  });

  it("精力持续偏低时建议恢复，但已在恢复模式就不重复提示", () => {
    const low = Array.from({ length: 3 }, (_, i) => log({ local_date: addDays(today, -i), energy: 1 }));
    expect(computeAlerts({ today, tasks: [], logs: low, feedback: [] }).map((a) => a.key)).toContain("low_energy");
    const resting = low.map((l) => ({ ...l, mode: "recovery" as const }));
    expect(computeAlerts({ today, tasks: [], logs: resting, feedback: [] }).map((a) => a.key)).not.toContain("low_energy");
  });
});

describe("最近 7 天小结只使用真实数据", () => {
  it("没有数据时明确说没有数据", () => {
    const s = summarizeWeek(today, [], []);
    expect(s.hasData).toBe(false);
    expect(s.originalDeliveries).toBe(0);
  });

  it("统计完成情况与障碍", () => {
    const tasks = [
      task({ local_date: today, kind: "reality", status: "done" }),
      task({ local_date: "2026-10-25", kind: "long_term", status: "not_started", obstacle: "too_big" }),
      task({ local_date: "2026-10-24", kind: "long_term", is_original_work: true, status: "done", output_level: "delivered" }),
      task({ local_date: "2026-10-10", kind: "reality", status: "done" }), // 窗口外
    ];
    const s = summarizeWeek(today, tasks, []);
    expect(s.reality).toEqual({ planned: 1, done: 1, partial: 0 });
    expect(s.longTerm.planned).toBe(2);
    expect(s.originalDeliveries).toBe(1);
    expect(s.topObstacles[0]).toMatchObject({ obstacle: "too_big", count: 1 });
    expect(s.days[0].date).toBe(today);
  });
});
