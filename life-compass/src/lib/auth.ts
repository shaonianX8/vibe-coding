import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isEmailAllowed } from "./env";

/** 页面和操作的真正权限检查：向认证服务确认身份，并检查邮箱允许名单。同一请求内只查一次。 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  if (!isEmailAllowed(data.user.email)) {
    await supabase.auth.signOut();
    redirect("/login?e=not_allowed");
  }
  return { supabase, user: data.user };
});
