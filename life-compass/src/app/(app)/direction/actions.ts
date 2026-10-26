"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveStrategy, listStrategyVersions, saveStrategyVersion, updateProfile } from "@/lib/data/repo";
import { isValidTimeZone } from "@/lib/domain/time";
import type { StrategyContent } from "@/lib/domain/types";

export type DirResult = { ok: true; message: string } | { ok: false; error: string };

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
const text = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);

export async function confirmTemplate(): Promise<void> {
  const { supabase } = await requireUser();
  const current = await getActiveStrategy(supabase);
  if (current.source !== "template" || current.confirmed_by_user) return;
  await saveStrategyVersion(supabase, {
    content: current.content,
    summary: "确认初始战略",
    reason: "用户确认初始战略内容符合自己的判断",
    evidence: null,
    source: "user",
    basedOn: current.version,
  });
  revalidatePath("/direction");
}

export async function saveStrategy(_prev: DirResult | null, fd: FormData): Promise<DirResult> {
  const { supabase } = await requireUser();
  const current = await getActiveStrategy(supabase);
  const reason = text(fd.get("change_reason"), 1000);
  if (!reason) return { ok: false, error: "请写下修改原因。重大战略变化需要你自己确认理由。" };

  const c = current.content;
  const constraint = text(fd.get("constraint_statement"), 500);
  const next: StrategyContent = {
    ...c,
    endgame: text(fd.get("endgame")) || c.endgame,
    principles: lines(fd.get("principles")).length ? lines(fd.get("principles")) : c.principles,
    strategy2036: text(fd.get("strategy2036")) || c.strategy2036,
    researchTheme: text(fd.get("researchTheme"), 500) || c.researchTheme,
    researchAreas: lines(fd.get("researchAreas")).length ? lines(fd.get("researchAreas")) : c.researchAreas,
    stage: {
      name: text(fd.get("stage_name"), 200) || c.stage.name,
      period: text(fd.get("stage_period"), 200) || c.stage.period,
      priorities: lines(fd.get("stage_priorities")).length ? lines(fd.get("stage_priorities")) : c.stage.priorities,
    },
    quarterFocus: {
      label: text(fd.get("q_label"), 100) || c.quarterFocus.label,
      reality: {
        goal: text(fd.get("q_reality_goal"), 300) || c.quarterFocus.reality.goal,
        first_step: text(fd.get("q_reality_first"), 300),
        minimum: text(fd.get("q_reality_min"), 300),
      },
      longTerm: {
        goal: text(fd.get("q_long_goal"), 300) || c.quarterFocus.longTerm.goal,
        first_step: text(fd.get("q_long_first"), 300),
        minimum: text(fd.get("q_long_min"), 300),
      },
      health: text(fd.get("q_health"), 300),
    },
    mainConstraint: constraint ? { statement: constraint, why: text(fd.get("constraint_why"), 1000), evidence: text(fd.get("constraint_evidence"), 1000) } : null,
  };
  if (JSON.stringify(next) === JSON.stringify(c)) return { ok: false, error: "内容没有变化。" };

  const changed: string[] = [];
  if (next.endgame !== c.endgame || JSON.stringify(next.principles) !== JSON.stringify(c.principles)) changed.push("终局与原则");
  if (next.strategy2036 !== c.strategy2036 || next.researchTheme !== c.researchTheme || JSON.stringify(next.researchAreas) !== JSON.stringify(c.researchAreas)) changed.push("长期战略");
  if (JSON.stringify(next.stage) !== JSON.stringify(c.stage)) changed.push("阶段");
  if (JSON.stringify(next.quarterFocus) !== JSON.stringify(c.quarterFocus)) changed.push("季度重点");
  if (JSON.stringify(next.mainConstraint) !== JSON.stringify(c.mainConstraint)) changed.push("主要限制因素");

  const saved = await saveStrategyVersion(supabase, {
    content: next,
    summary: `修改了：${changed.join("、")}`,
    reason,
    evidence: text(fd.get("evidence"), 1000) || null,
    source: "user",
    basedOn: current.version,
  });
  revalidatePath("/direction");
  revalidatePath("/today");
  return { ok: true, message: `已保存为第 ${saved.version} 版。旧版本保留，可以随时恢复。` };
}

export async function restoreVersion(fd: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const version = Number(fd.get("version"));
  const versions = await listStrategyVersions(supabase);
  const target = versions.find((v) => v.version === version);
  const current = versions.find((v) => v.status === "active");
  if (!target || !current || target.status === "active" || target.source === "ai_proposal") return;
  await saveStrategyVersion(supabase, {
    content: target.content,
    summary: `恢复到第 ${target.version} 版`,
    reason: text(fd.get("reason"), 500) || `恢复到第 ${target.version} 版`,
    evidence: null,
    source: "restore",
    basedOn: current.version,
  });
  revalidatePath("/direction");
  revalidatePath("/today");
}

export async function addBelief(fd: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const kind = String(fd.get("kind"));
  const statement = text(fd.get("statement"), 2000);
  if (!["fact", "hypothesis", "constraint"].includes(kind) || !statement) return;
  const review = String(fd.get("review_after") ?? "");
  await supabase.from("beliefs").insert({
    user_id: user.id,
    kind,
    statement,
    source: "user_confirmed",
    confirmed_by_user: true,
    review_after: /^\d{4}-\d{2}-\d{2}$/.test(review) ? review : null,
    evidence: text(fd.get("evidence"), 1000) || null,
  });
  revalidatePath("/direction");
}

export async function updateBelief(fd: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const id = String(fd.get("id") ?? "");
  const op = String(fd.get("op"));
  if (op === "invalidate") {
    await supabase.from("beliefs").update({ is_valid: false, invalidated_reason: text(fd.get("reason"), 500) || "用户标记为不再成立" }).eq("id", id);
  } else if (op === "reconfirm") {
    const review = String(fd.get("review_after") ?? "");
    await supabase
      .from("beliefs")
      .update({ confirmed_by_user: true, review_after: /^\d{4}-\d{2}-\d{2}$/.test(review) ? review : null })
      .eq("id", id);
  }
  revalidatePath("/direction");
}

export async function saveSettings(_prev: DirResult | null, fd: FormData): Promise<DirResult> {
  const { supabase, user } = await requireUser();
  const time = String(fd.get("reminder_time") ?? "");
  const tz = String(fd.get("timezone") ?? "").trim();
  const pause = String(fd.get("reminders_paused_until") ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "提醒时间格式不对" };
  if (!isValidTimeZone(tz)) return { ok: false, error: "时区无效，例如 Asia/Shanghai" };
  await updateProfile(supabase, user.id, {
    reminder_time: time,
    timezone: tz,
    reminders_enabled: fd.get("reminders_enabled") === "on",
    reminders_paused_until: /^\d{4}-\d{2}-\d{2}$/.test(pause) ? pause : null,
  });
  revalidatePath("/direction");
  return { ok: true, message: "设置已保存" };
}

export async function deleteMyData(_prev: DirResult | null, fd: FormData): Promise<DirResult> {
  const { supabase } = await requireUser();
  if (String(fd.get("confirm") ?? "").trim() !== "删除我的全部数据") return { ok: false, error: "请完整输入确认文字。" };
  const { error } = await supabase.rpc("delete_my_data");
  if (error) return { ok: false, error: "删除失败，请稍后再试。" };
  redirect("/today");
}
