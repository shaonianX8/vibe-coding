// 测试只允许连接本地数据库，防止模拟数据进入正式环境。
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // 没有 .env.local 时使用当前环境变量
  }
}

loadEnvFile();

export const URL = process.env.SUPABASE_URL ?? "";
export const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
export const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

export function assertLocal() {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
    throw new Error(`测试拒绝运行：SUPABASE_URL 不是本地地址（${URL}）。模拟数据只能写入本地测试数据库。`);
  }
}

export const USERS = {
  owner: { email: "owner@test.local", password: "test-password-123" },
  other: { email: "other@test.local", password: "test-password-123" },
  stranger: { email: "stranger@test.local", password: "test-password-123" },
};

export function admin() {
  assertLocal();
  return createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function ensureUser(email: string, password: string): Promise<string> {
  const a = admin();
  const { data: list } = await a.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`创建测试用户失败：${error?.message}`);
  return data.user.id;
}

const TABLES = ["ai_suggestions", "ai_usage", "alert_feedback", "notifications", "push_subscriptions", "daily_logs", "tasks", "beliefs", "strategy_versions", "profiles"];

export async function wipeUser(userId: string) {
  const a = admin();
  for (const t of TABLES) await a.from(t).delete().eq("user_id", userId);
}

export async function signedIn(email: string, password: string) {
  assertLocal();
  const c = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`登录失败：${error.message}`);
  return c;
}
