import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureProfile } from "@/lib/data/repo";
import { localDate } from "@/lib/domain/time";
import { sendToUser } from "@/lib/push/send";

const DAILY_TEST_LIMIT = 10;

// 用户手动发送一条测试推送，验证 iPhone 能否收到
export async function POST() {
  const { supabase, user } = await requireUser();
  const profile = await ensureProfile(supabase, user.id);
  const today = localDate(new Date(), profile.timezone);

  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "test").eq("local_date", today);
  if ((count ?? 0) >= DAILY_TEST_LIMIT) return NextResponse.json({ ok: false, message: "今天的测试次数已用完" }, { status: 429 });

  const { data: row, error } = await supabase
    .from("notifications")
    .insert({ user_id: user.id, kind: "test", local_date: today, dedupe_key: `test:${Date.now()}`, status: "pending", attempts: 1, last_attempt_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ ok: false, message: "记录失败" }, { status: 500 });

  const summary = await sendToUser(supabase, user.id, {
    title: "人生校准器",
    body: "测试推送：如果你在锁屏看到这条，提醒功能可用。",
    url: `/direction?src=push&n=${row.id}`,
    tag: "test",
  });
  const ok = summary.accepted > 0;
  await supabase
    .from("notifications")
    .update({
      status: ok ? "accepted" : "failed",
      accepted_count: summary.accepted,
      failed_count: summary.failed + summary.expired,
      accepted_at: ok ? new Date().toISOString() : null,
      last_error: summary.lastError,
    })
    .eq("id", row.id);

  const message = ok
    ? `推送服务已接收（${summary.accepted} 台设备）。请看手机是否收到，点开通知后系统会记录「已打开」。`
    : summary.lastError === "no_subscription"
      ? "这台设备还没有开启通知。"
      : summary.lastError === "vapid_not_configured"
        ? "服务器还没有配置推送密钥（VAPID）。"
        : `发送失败（${summary.lastError ?? "未知"}）。`;
  return NextResponse.json({ ok, message });
}
