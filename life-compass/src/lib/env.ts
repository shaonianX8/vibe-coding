// 所有密钥只在服务端读取。浏览器端不需要任何 NEXT_PUBLIC_ 变量。
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}，请参考 .env.example`);
  return v;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabasePublishableKey: () => required("SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  cronSecret: () => required("CRON_SECRET"),
  allowedEmails: (): string[] =>
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  vapid: () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
  },
  ai: () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return {
      apiKey,
      model: process.env.AI_MODEL || "claude-opus-5-5",
      dailyLimit: Number(process.env.AI_DAILY_LIMIT || 20),
    };
  },
};

/** 允许名单为空时拒绝所有人，避免部署后被陌生人注册使用 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.allowedEmails().includes(email.toLowerCase());
}
