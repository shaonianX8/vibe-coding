"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FollowupSuggestion } from "@/lib/domain/followup";
import { buildNextDraft } from "@/lib/domain/followup";
import type { Adjustment, Task, TaskDraft } from "@/lib/domain/types";
import { ADJUSTMENT_LABEL } from "@/lib/domain/types";
import type { FollowupAiOutput } from "@/lib/ai/provider";
import { acceptFollowup, refineWithAi, rejectFollowup } from "@/app/(app)/today/actions";
import { TaskFields } from "./TaskFields";

interface AiState {
  id: string;
  output: FollowupAiOutput;
  model: string;
}

export function FollowupPanel({
  task,
  history,
  suggestion,
  aiEnabled,
  initialAi,
}: {
  task: Task;
  history: Task[];
  suggestion: FollowupSuggestion;
  aiEnabled: boolean;
  initialAi: AiState | null;
}) {
  const router = useRouter();
  const [adjustment, setAdjustment] = useState<Adjustment>(suggestion.adjustment);
  const [draft, setDraft] = useState<TaskDraft | null>(suggestion.nextDraft);
  const [ai, setAi] = useState<AiState | null>(initialAi);
  const [useAi, setUseAi] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchTo(adj: Adjustment) {
    setAdjustment(adj);
    setDraft(buildNextDraft(task, adj, history));
    setUseAi(false);
    setFormKey((k) => k + 1);
  }

  function applyAi() {
    if (!ai?.output.next_task || !draft) return;
    const n = ai.output.next_task;
    setAdjustment(ai.output.adjustment);
    setDraft({ ...draft, title: n.title, first_step: n.first_step, minimum_action: n.minimum_action, start_time: n.start_time ?? draft.start_time, adjustment: ai.output.adjustment });
    setUseAi(true);
    setFormKey((k) => k + 1);
  }

  function askAi() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await refineWithAi(task.id);
        if (res.ok) setAi({ id: res.suggestionId, output: res.output, model: res.model });
        else setError(res.message);
      } catch {
        setError("网络中断，AI 建议没有生成。规则建议仍然有效。");
      }
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setMessage(res.message ?? "已记录");
          router.refresh();
        } else setError(res.error ?? "操作失败");
      } catch {
        setError("网络中断，请联网后再试。");
      }
    });
  }

  const nextDate = suggestion.nextDate;

  return (
    <div className="card soft stack" aria-label="下一步建议">
      <div>
        <div className="kicker">下一步</div>
        <p style={{ fontWeight: 600 }}>{suggestion.headline}</p>
        {suggestion.facts.length ? (
          <ul className="dots small">
            {suggestion.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
        {suggestion.questions.map((q) => (
          <p key={q} className="small">
            {q}
          </p>
        ))}
      </div>

      {ai ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="kicker">AI 补充（{ai.model}，仅供参考）</div>
          <p className="small">{ai.output.observation}</p>
          {ai.output.possible_explanations.length ? <p className="small muted">可能的解释：{ai.output.possible_explanations.join("；")}</p> : null}
          {ai.output.unknowns.length ? <p className="small muted">尚不清楚：{ai.output.unknowns.join("；")}</p> : null}
          <p className="small muted">建议调整：{ADJUSTMENT_LABEL[ai.output.adjustment]}，{ai.output.recheck_in_days} 天后复查</p>
          {ai.output.next_task && draft ? (
            <button type="button" onClick={applyAi} disabled={useAi}>
              {useAi ? "已填入下方，可以修改" : "把 AI 的版本填入下方"}
            </button>
          ) : null}
        </div>
      ) : null}

      {draft && nextDate ? (
        <form
          key={formKey}
          action={(fd) => run(() => acceptFollowup(fd))}
          onInput={(e) => (e.currentTarget.elements.namedItem("edited") as HTMLInputElement).setAttribute("value", "1")}
          className="stack"
        >
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="kind" value={task.kind} />
          <input type="hidden" name="adjustment" value={adjustment} />
          <input type="hidden" name="edited" value="0" />
          {ai ? <input type="hidden" name="ai_suggestion_id" value={ai.id} /> : null}
          <input type="hidden" name="ai_used" value={useAi ? "1" : "0"} />
          <p className="small">
            调整方式：<strong>{ADJUSTMENT_LABEL[adjustment]}</strong>
            {draft.origin_note ? <span className="muted">（{draft.origin_note}）</span> : null}
          </p>
          <div>
            <label htmlFor={`next-date-${task.id}`}>安排在</label>
            <input id={`next-date-${task.id}`} type="date" name="date" defaultValue={nextDate} />
          </div>
          <TaskFields kind={task.kind} values={draft} highlightFirstStep={adjustment === "define_first_step"} />
          <div className="row">
            <button className="primary" type="submit" disabled={pending}>
              按这个安排
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => rejectFollowup(formData(task.id, ai?.id ?? null, false)))}>
              不用了
            </button>
          </div>
        </form>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(() => rejectFollowup(formData(task.id, ai?.id ?? null, true)))}>
          知道了
        </button>
      )}

      {draft && suggestion.alternatives.length ? (
        <details>
          <summary>换一种调整方式</summary>
          <div className="chips">
            {suggestion.alternatives.map((a) => (
              <button key={a.adjustment} type="button" onClick={() => switchTo(a.adjustment)} className="small">
                {a.label}
                {a.record ? `（${a.record}）` : ""}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {aiEnabled && !ai ? (
        <button type="button" onClick={askAi} disabled={pending}>
          {pending ? "请稍候…" : "让 AI 细化这条建议"}
        </button>
      ) : null}
      {message ? <p className="notice">{message}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formData(taskId: string, aiId: string | null, acknowledge: boolean): FormData {
  const fd = new FormData();
  fd.set("task_id", taskId);
  if (aiId) fd.set("ai_suggestion_id", aiId);
  if (acknowledge) fd.set("acknowledge", "1");
  return fd;
}
