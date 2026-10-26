"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { ensureProfile } from "@/lib/data/repo";
import { localDate } from "@/lib/domain/time";

export async function alertFeedback(fd: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const profile = await ensureProfile(supabase, user.id);
  const key = String(fd.get("alert_key") ?? "").slice(0, 64);
  const verdict = fd.get("verdict") === "useful" ? "useful" : "inaccurate";
  if (!key) return;
  await supabase.from("alert_feedback").insert({
    user_id: user.id,
    alert_key: key,
    verdict,
    note: String(fd.get("note") ?? "").slice(0, 500) || null,
    local_date: localDate(new Date(), profile.timezone),
  });
  revalidatePath("/records");
}
