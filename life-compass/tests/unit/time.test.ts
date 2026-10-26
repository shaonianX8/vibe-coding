import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isoWeekday,
  localNow,
  previousHalfYear,
  previousMonth,
  previousQuarter,
  previousWeek,
  previousYear,
  reviewsDueOn,
} from "@/lib/domain/time";

describe("本地时间", () => {
  it("UTC 时刻换算为上海本地日期，跨午夜正确", () => {
    // UTC 10月26日 16:30 = 上海 10月27日 00:30
    expect(localNow(new Date("2026-10-26T16:30:00Z"), "Asia/Shanghai")).toEqual({ date: "2026-10-27", minutes: 30 });
    expect(localNow(new Date("2026-10-26T15:59:00Z"), "Asia/Shanghai")).toEqual({ date: "2026-10-26", minutes: 23 * 60 + 59 });
  });

  it("加减天数跨月、跨年、闰年", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(daysBetween("2026-12-25", "2027-01-08")).toBe(14);
  });

  it("周几", () => {
    expect(isoWeekday("2026-10-26")).toBe(1); // 周一
    expect(isoWeekday("2026-11-01")).toBe(7); // 周日
  });
});

describe("复盘周期：总是上一个完整周期", () => {
  it("周复盘：上一个完整自然周，跨月跨年", () => {
    expect(previousWeek("2026-10-26")).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
    expect(previousWeek("2026-10-28")).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
    expect(previousWeek("2027-01-04")).toMatchObject({ start: "2026-12-28", end: "2027-01-03" });
    expect(previousWeek("2026-11-01")).toMatchObject({ start: "2026-10-19", end: "2026-10-25" }); // 周日仍属本周
  });

  it("月复盘：跨年与二月", () => {
    expect(previousMonth("2027-01-01")).toMatchObject({ start: "2026-12-01", end: "2026-12-31" });
    expect(previousMonth("2027-03-01")).toMatchObject({ start: "2027-02-01", end: "2027-02-28" });
    expect(previousMonth("2028-03-15")).toMatchObject({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("季度复盘：跨年", () => {
    expect(previousQuarter("2027-01-01")).toMatchObject({ start: "2026-10-01", end: "2026-12-31", label: "2026年第4季度" });
    expect(previousQuarter("2026-10-01")).toMatchObject({ start: "2026-07-01", end: "2026-09-30" });
    expect(previousQuarter("2027-05-20")).toMatchObject({ start: "2027-01-01", end: "2027-03-31" });
  });

  it("半年与年度复盘", () => {
    expect(previousHalfYear("2027-01-01")).toMatchObject({ start: "2026-07-01", end: "2026-12-31" });
    expect(previousHalfYear("2027-07-01")).toMatchObject({ start: "2027-01-01", end: "2027-06-30" });
    expect(previousYear("2027-01-01")).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("同一天多个复盘到期时合并", () => {
    // 2029-01-01 是周一：周、月、季、半年、年同时到期
    expect(reviewsDueOn("2029-01-01")).toEqual(["week", "month", "quarter", "half", "year"]);
    expect(reviewsDueOn("2026-10-27")).toEqual([]);
    expect(reviewsDueOn("2026-11-01")).toEqual(["month"]);
  });
});
