import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const TABLES = ["profiles", "strategy_versions", "beliefs", "tasks", "daily_logs", "notifications", "ai_suggestions", "ai_usage", "alert_feedback"] as const;

// 导出本人全部数据（JSON）。推送订阅只导出设备信息，不导出加密密钥。
export async function GET() {
  const { supabase, user } = await requireUser();
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    format: "life-compass-export-v1",
    user: { id: user.id, email: user.email },
  };
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select("*").limit(100000);
    if (error) return NextResponse.json({ error: `export_failed_${t}` }, { status: 500 });
    out[t] = data;
  }
  const { data: subs } = await supabase.from("push_subscriptions").select("id,user_agent,created_at,last_success_at,disabled_at,disabled_reason");
  out.push_subscriptions = subs;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="life-compass-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
