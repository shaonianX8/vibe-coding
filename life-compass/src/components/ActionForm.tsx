"use client";

import { useActionState } from "react";

type Result = { ok: true; message: string } | { ok: false; error: string } | null;

// 通用表单：服务端操作返回成功或错误信息，就地显示
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "stack",
  danger = false,
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state && state.ok ? <p className="notice">{state.message}</p> : null}
      <button type="submit" className={danger ? "danger" : "primary"} disabled={pending}>
        {pending ? "处理中…" : submitLabel}
      </button>
    </form>
  );
}
