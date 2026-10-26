import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

// 用户点开通知时由 service worker 调用。这是「用户确实看到了」的唯一可靠信号。
export async function POST(req: Request) {
  const { supabase } = await requireUser();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await supabase.from("notifications").update({ opened_at: new Date().toISOString() }).eq("id", parsed.data.id).is("opened_at", null);
  return NextResponse.json({ ok: true });
}
