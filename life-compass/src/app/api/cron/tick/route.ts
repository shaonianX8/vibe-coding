import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReminderTick } from "@/lib/push/tick";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 由 Supabase Cron（pg_cron + pg_net）每 10 分钟调用。重复调用是安全的。
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nowParam = new URL(req.url).searchParams.get("now");
  // 只在测试环境允许指定时间，便于验证跨天与重复执行
  const now = nowParam && process.env.ALLOW_TEST_CLOCK === "1" ? new Date(nowParam) : new Date();
  try {
    const result = await runReminderTick(createAdminClient(), now);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
