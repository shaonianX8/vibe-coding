import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main>
      <h1>人生校准器</h1>
      <p className="muted">识别重要的事，降低正确行动的启动成本，从真实结果中学习。</p>
      <LoginForm initialError={e === "not_allowed" ? "这个账户不在允许名单中。" : null} />
      <p className="muted small">账户由你自己在 Supabase 后台创建，应用不开放注册。</p>
    </main>
  );
}
