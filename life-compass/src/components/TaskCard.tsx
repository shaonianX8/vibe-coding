"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FollowupSuggestion } from "@/lib/domain/followup";
import type { Task } from "@/lib/domain/types";
import { KIND_LABEL, OBSTACLE_LABEL, OUTPUT_LABEL, STATUS_LABEL } from "@/lib/domain/types";
import type { FollowupAiOutput } from "@/lib/ai/provider";
import { editTask, startTask } from "@/app/(app)/today/actions";
import { FollowupPanel } from "./FollowupPanel";
import { OutcomeForm } from "./OutcomeForm";
import { TaskFields } from "./TaskFields";

export interface TaskCardProps {
  task: Task;
  today: string;
  history: Task[];
  suggestion: FollowupSuggestion | null;
  aiEnabled: boolean;
  ai: { id: string; output: FollowupAiOutput; model: string } | null;
  timezone: string;
}

export function TaskCard({ task, today, history, suggestion, aiEnabled, ai, timezone }: TaskCardProps) {
  const recorded = task.status !== "planned";
  const [mode, setMode] = useState<"view" | "edit" | "record">("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function saveEdit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await editTask(fd);
        if (res.ok) {
          setMode("view");
          router.refresh();
        } else setError(res.error);
      } catch {
        setError("网络中断，修改没有保存。");
      }
    });
  }

  return (
    <section className="card" aria-label={KIND_LABEL[task.kind]}>
      <div className="spread">
        <span className="kicker">{task.kind === "reality" ? "最重要的现实责任" : "最重要的长期积累"}</span>
        <span className={`tag ${task.status === "done" ? "ok" : task.status === "not_started" ? "warn" : ""}`}>{STATUS_LABEL[task.status]}</span>
      </div>
      <h2 style={{ marginTop: 6 }}>{task.title}</h2>

      {mode === "edit" ? (
        <form action={saveEdit} className="stack">
          <input type="hidden" name="task_id" value={task.id} />
          <TaskFields kind={task.kind} values={task} />
          {error ? <p className="error">{error}</p> : null}
          <div className="row">
            <button className="primary" type="submit" disabled={pending}>
              保存修改
            </button>
            <button type="button" onClick={() => setMode("view")}>
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          {!recorded ? (
            <>
              {task.first_step ? <p className="first-step">第一步：{task.first_step}</p> : <p className="muted">还没有写第一步。点「修改」补上一个 2 分钟内能开始的动作。</p>}
              <p className="muted small">
                {[task.start_time ? `${task.start_time.slice(0, 5)} 开始` : null, task.place].filter(Boolean).join(" · ")}
              </p>
              {task.minimum_action ? <p className="small">时间不够时：{task.minimum_action}</p> : null}
              <div className="row" style={{ marginTop: 10 }}>
                {task.started_at ? (
                  <span className="tag ok">已开始 {new Date(task.started_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</span>
                ) : (
                  <form action={startTask}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <button className="primary" type="submit">
                      开始行动
                    </button>
                  </form>
                )}
                <button type="button" onClick={() => setMode(mode === "record" ? "view" : "record")}>
                  记录结果
                </button>
                <button type="button" onClick={() => setMode("edit")}>
                  修改
                </button>
              </div>
            </>
          ) : (
            <div className="small">
              {task.output_level ? <p>产出：{OUTPUT_LABEL[task.output_level]}{task.did_minimum_only ? "（最低行动）" : ""}</p> : null}
              {task.obstacle ? <p>障碍：{OBSTACLE_LABEL[task.obstacle]}{task.obstacle_note ? `，${task.obstacle_note}` : ""}</p> : null}
              {task.result_note ? <p>结果：{task.result_note}</p> : null}
              {task.defer_to ? <p>延后到：{task.defer_to}</p> : null}
              <button type="button" className="small" onClick={() => setMode(mode === "record" ? "view" : "record")}>
                更正结果
              </button>
            </div>
          )}
          {mode === "record" ? (
            <div style={{ marginTop: 12 }}>
              <OutcomeForm task={task} today={today} onDone={() => setMode("view")} />
            </div>
          ) : null}
        </>
      )}

      {recorded && mode === "view" && suggestion && !task.followup_decision ? (
        <FollowupPanel task={task} history={history} suggestion={suggestion} aiEnabled={aiEnabled} initialAi={ai} />
      ) : null}
      {recorded && task.followup_decision ? (
        <p className="muted small">
          下一步：
          {{ accepted: "已按建议安排", modified: "已修改后安排", rejected: "没有采用建议", acknowledged: "已知悉" }[task.followup_decision]}
        </p>
      ) : null}
    </section>
  );
}
