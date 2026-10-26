import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  const parsed = SubscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      disabled_at: null,
      disabled_reason: null,
      failure_count: 0,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { supabase } = await requireUser();
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString(), disabled_reason: "user_unsubscribed" }).eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
