// 数据库层面的权限与约束测试：直接对本地 Supabase 发请求，不经过应用代码。
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLISHABLE, URL, USERS, assertLocal, ensureUser, signedIn, wipeUser } from "../helpers/local";
import { STRATEGY_TEMPLATE } from "@/lib/strategy/template";

let owner: SupabaseClient;
let other: SupabaseClient;
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  assertLocal();
  ownerId = await ensureUser(USERS.owner.email, USERS.owner.password);
  otherId = await ensureUser(USERS.other.email, USERS.other.password);
  await wipeUser(ownerId);
  await wipeUser(otherId);
  owner = await signedIn(USERS.owner.email, USERS.owner.password);
  other = await signedIn(USERS.other.email, USERS.other.password);
});

describe("不同账户不能读取或修改彼此数据", () => {
  it("读、改、删、冒名写入都被拒绝", async () => {
    const { data: t, error } = await owner.from("tasks").insert({ user_id: ownerId, local_date: "2026-10-26", kind: "reality", title: "只属于 owner" }).select("id").single();
    expect(error).toBeNull();

    const read = await other.from("tasks").select("*").eq("id", t!.id);
    expect(read.data).toEqual([]);

    const upd = await other.from("tasks").update({ title: "被篡改" }).eq("id", t!.id).select("id");
    expect(upd.data).toEqual([]);

    const del = await other.from("tasks").delete().eq("id", t!.id).select("id");
    expect(del.data).toEqual([]);

    const forged = await other.from("tasks").insert({ user_id: ownerId, local_date: "2026-10-27", kind: "reality", title: "冒名" });
    expect(forged.error).not.toBeNull();

    const still = await owner.from("tasks").select("title").eq("id", t!.id).single();
    expect(still.data?.title).toBe("只属于 owner");
  });

  it("未登录的匿名请求读不到任何数据", async () => {
    const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
    for (const table of ["tasks", "profiles", "strategy_versions", "beliefs", "push_subscriptions", "notifications"]) {
      const res = await anon.from(table).select("*").limit(1);
      expect(res.data ?? [], table).toEqual([]);
    }
  });

  it("推送订阅（可向设备发通知的凭据）互相不可见", async () => {
    await owner.from("push_subscriptions").insert({ user_id: ownerId, endpoint: "https://push.example/owner", p256dh: "k", auth: "a" });
    const res = await other.from("push_subscriptions").select("*");
    expect(res.data).toEqual([]);
  });
});

describe("战略版本：重大目标变化可追溯、可恢复，AI 不能直接改写", () => {
  it("保存新版本时必须写原因，并自动归档旧版本", async () => {
    const first = await owner.rpc("save_strategy_version", { p_content: STRATEGY_TEMPLATE, p_change_summary: "模板", p_change_reason: null, p_evidence: null, p_source: "template", p_based_on: null });
    expect(first.error).toBeNull();

    const noReason = await owner.rpc("save_strategy_version", { p_content: STRATEGY_TEMPLATE, p_change_summary: "x", p_change_reason: " ", p_evidence: null, p_source: "user", p_based_on: 1 });
    expect(noReason.error?.message).toContain("change reason required");

    const changed = { ...STRATEGY_TEMPLATE, strategy2036: "特别测试：重大目标发生变化" };
    const second = await owner.rpc("save_strategy_version", { p_content: changed, p_change_summary: "改目标", p_change_reason: "新证据", p_evidence: "某项合作结束", p_source: "user", p_based_on: 1 });
    expect(second.error).toBeNull();

    const { data } = await owner.from("strategy_versions").select("version,status,confirmed_by_user,content").order("version");
    expect(data?.map((v) => [v.version, v.status])).toEqual([
      [1, "archived"],
      [2, "active"],
    ]);
    expect(data?.[1].confirmed_by_user).toBe(true);
    expect((data?.[0].content as typeof STRATEGY_TEMPLATE).strategy2036).toBe(STRATEGY_TEMPLATE.strategy2036);
  });

  it("并发保存不会产生两个生效版本", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        owner.rpc("save_strategy_version", { p_content: STRATEGY_TEMPLATE, p_change_summary: `并发${i}`, p_change_reason: "并发测试", p_evidence: null, p_source: "user", p_based_on: 2 }),
      ),
    );
    const { data } = await owner.from("strategy_versions").select("status").eq("status", "active");
    expect(data).toHaveLength(1);
  });

  it("AI 提案无法成为生效战略", async () => {
    const viaRpc = await owner.rpc("save_strategy_version", { p_content: STRATEGY_TEMPLATE, p_change_summary: "ai", p_change_reason: "ai", p_evidence: null, p_source: "ai_proposal", p_based_on: 1 });
    expect(viaRpc.error).not.toBeNull();
    const direct = await owner.from("strategy_versions").insert({ user_id: ownerId, version: 999, status: "active", content: STRATEGY_TEMPLATE, source: "ai_proposal" });
    expect(direct.error).not.toBeNull();
    const proposed = await owner.from("strategy_versions").insert({ user_id: ownerId, version: 998, status: "proposed", content: STRATEGY_TEMPLATE, source: "ai_proposal" });
    expect(proposed.error).toBeNull();
    const promote = await owner.from("strategy_versions").update({ status: "active" }).eq("version", 998);
    expect(promote.error).not.toBeNull();
  });
});

describe("事实与假设分离；不同身份的资料不会混入", () => {
  it("AI 推测只能作为假设写入，不能写成事实或约束", async () => {
    const fact = await owner.from("beliefs").insert({ user_id: ownerId, kind: "fact", statement: "AI 说你很懒", source: "ai_inferred" });
    expect(fact.error).not.toBeNull();
    const hyp = await owner.from("beliefs").insert({ user_id: ownerId, kind: "hypothesis", statement: "可能在下午更难开始", source: "ai_inferred" });
    expect(hyp.error).toBeNull();
  });

  it("特别测试：另一个身份写入的健康与财务资料，对本人完全不可见", async () => {
    await other.from("beliefs").insert({ user_id: otherId, kind: "fact", statement: "其他人的体检结果", source: "imported", confirmed_by_user: false });
    const mine = await owner.from("beliefs").select("statement");
    expect(mine.data?.map((b) => b.statement)).not.toContain("其他人的体检结果");
  });

  it("删除本人资料只删除自己的数据", async () => {
    await other.from("tasks").insert({ user_id: otherId, local_date: "2026-10-26", kind: "reality", title: "other 的任务" });
    const res = await owner.rpc("delete_my_data");
    expect(res.error).toBeNull();
    expect((await owner.from("tasks").select("id")).data).toEqual([]);
    expect((await owner.from("strategy_versions").select("id")).data).toEqual([]);
    expect((await other.from("tasks").select("title")).data?.map((t) => t.title)).toContain("other 的任务");
  });
});

describe("数据约束", () => {
  it("同一天同一类关键任务只能有一个（重复提交天然幂等）", async () => {
    const a = await owner.from("tasks").insert({ user_id: ownerId, local_date: "2026-11-01", kind: "long_term", title: "A" });
    const b = await owner.from("tasks").insert({ user_id: ownerId, local_date: "2026-11-01", kind: "long_term", title: "B" });
    expect(a.error).toBeNull();
    expect(b.error?.code).toBe("23505");
  });

  it("非法状态值被拒绝", async () => {
    const res = await owner.from("tasks").insert({ user_id: ownerId, local_date: "2026-11-02", kind: "reality", title: "x", status: "finished" });
    expect(res.error).not.toBeNull();
  });
});
