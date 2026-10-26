import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/**
 * 服务端特权客户端，绕过 RLS。只允许在云端定时任务中使用（读取到期提醒、写通知记录）。
 * 永远不要在处理用户请求的页面或操作里使用它。
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
