// 数据访问层的保护逻辑：采纳建议时不悄悄覆盖已有计划。
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USERS, ensureUser, signedIn, wipeUser } from "../helpers/local";
import { putTask } from "@/lib/data/repo";

let db: SupabaseClient;
let userId: string;

const base = {
  kind: "reality" as const,
  start_time: null,
  place: null,
  first_step: null,
  full_goal: null,
  minimum_action: null,
  due_date: null,
  is_original_work: false,
  adjustment: "none" as const,
  source: "user" as const,
};

beforeAll(async () => {
  userId = await ensureUser(USERS.owner.email, USERS.owner.password);
  db = await signedIn(USERS.owner.email, USERS.owner.password);
});
beforeEach(() => wipeUser(userId));

describe("写入关键任务", () => {
  it("采纳建议时，那天已有另一件计划：拒绝覆盖", async () => {
    const plan = await putTask(db, userId, "2026-10-27", { ...base, title: "我自己的计划", carried_from_task_id: null });
    expect(plan.ok).toBe(true);
    const { data: src } = await db.from("tasks").insert({ user_id: userId, local_date: "2026-10-26", kind: "reality", title: "原任务", status: "partial" }).select("id").single();
    const res = await putTask(db, userId, "2026-10-27", { ...base, title: "建议的任务", carried_from_task_id: src!.id }, "followup");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("我自己的计划");
    const { data } = await db.from("tasks").select("title").eq("local_date", "2026-10-27").single();
    expect(data?.title).toBe("我自己的计划");
  });

  it("同一件原任务再次采纳：更新之前的安排", async () => {
    const { data: src } = await db.from("tasks").insert({ user_id: userId, local_date: "2026-10-26", kind: "reality", title: "原任务", status: "partial" }).select("id").single();
    await putTask(db, userId, "2026-10-27", { ...base, title: "第一次采纳", carried_from_task_id: src!.id }, "followup");
    const again = await putTask(db, userId, "2026-10-27", { ...base, title: "改了主意", carried_from_task_id: src!.id }, "followup");
    expect(again.ok).toBe(true);
    const { data } = await db.from("tasks").select("title").eq("local_date", "2026-10-27");
    expect(data).toEqual([{ title: "改了主意" }]);
  });

  it("已经记录结果的任务不会被覆盖", async () => {
    await db.from("tasks").insert({ user_id: userId, local_date: "2026-10-27", kind: "reality", title: "已完成", status: "done" });
    const res = await putTask(db, userId, "2026-10-27", { ...base, title: "新的", carried_from_task_id: null });
    expect(res.ok).toBe(false);
  });
});
