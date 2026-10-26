import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendSummary {
  accepted: number;
  failed: number;
  expired: number;
  retryable: boolean;
  lastError: string | null;
}

let configured = false;
function configure(): boolean {
  const v = env.vapid();
  if (!v) return false;
  if (!configured) {
    webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey);
    configured = true;
  }
  return true;
}

/**
 * 给一个用户的所有有效订阅发送推送。
 * 推送服务返回 201 只表示「已接收」，不代表用户已经看到。
 * db 可以是用户会话（测试推送）或服务端特权客户端（定时提醒）。
 */
export async function sendToUser(db: SupabaseClient, userId: string, payload: PushPayload): Promise<SendSummary> {
  const summary: SendSummary = { accepted: 0, failed: 0, expired: 0, retryable: false, lastError: null };
  if (!configure()) return { ...summary, lastError: "vapid_not_configured" };

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId)
    .is("disabled_at", null);
  if (!subs || subs.length === 0) return { ...summary, lastError: "no_subscription" };

  for (const sub of subs as SubRow[]) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        TTL: 6 * 3600,
        urgency: "normal",
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
      });
      summary.accepted += 1;
      await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      summary.lastError = status ? `http_${status}` : "network";
      if (status === 404 || status === 410) {
        // 订阅已失效（用户删除了应用或撤销了权限）
        summary.expired += 1;
        await db.from("push_subscriptions").update({ disabled_at: new Date().toISOString(), disabled_reason: `expired_${status}` }).eq("id", sub.id);
      } else {
        summary.failed += 1;
        if (!status || status === 429 || status >= 500) summary.retryable = true;
        const { data: row } = await db.from("push_subscriptions").select("failure_count").eq("id", sub.id).single();
        await db
          .from("push_subscriptions")
          .update({ last_failure_at: new Date().toISOString(), failure_count: ((row?.failure_count as number) ?? 0) + 1 })
          .eq("id", sub.id);
      }
    }
  }
  return summary;
}
