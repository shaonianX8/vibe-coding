"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Obstacle, OutputLevel, Task, TaskStatus } from "@/lib/domain/types";
import { OBSTACLE_LABEL, OUTPUT_LABEL, STATUS_LABEL } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/time";
import { recordOutcome } from "@/app/(app)/today/actions";
import { clearFormDraft, useFormDraft } from "./useFormDraft";

const STATUSES: TaskStatus[] = ["done", "partial", "not_started", "cancelled", "deferred"];
const OUTPUTS: OutputLevel[] = ["thinking", "planning", "preparing", "executing", "delivered", "result"];
const OBSTACLES = Object.keys(OBSTACLE_LABEL) as Obstacle[];

export function OutcomeForm({ task, today, onDone }: { task: Task; today: string; onDone?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [openedAt] = useState(() => Date.now());
  const initial = task.status === "planned" ? null : task.status;
  const [status, setStatus] = useState<TaskStatus | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const draftKey = `lc-outcome-${task.id}`;
  useFormDraft(formRef, draftKey, (v) => {
    if (typeof v.status === "string") setStatus(v.status as TaskStatus);
  });

  async function submit(fd: FormData) {
    if (!fd.get("status")) {
      setError("请选择执行结果");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await recordOutcome(fd);
      if (res.ok) {
        clearFormDraft(draftKey);
        onDone?.();
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("网络中断，结果没有保存。内容已暂存在这台手机上，联网后再点一次即可。");
    } finally {
      setPending(false);
    }
  }

  const showOutput = status === "done" || status === "partial";
  const showObstacle = status === "not_started" || status === "partial";

  return (
    <form ref={formRef} action={submit} className="stack">
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="opened_at" value={openedAt} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted small">结果</legend>
        <div className="chips">
          {STATUSES.map((s) => (
            <label key={s} className="chip">
              <input type="radio" name="status" value={s} defaultChecked={initial === s} onChange={() => setStatus(s)} />
              <span>{STATUS_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status === "done" ? (
        <label className="row" style={{ color: "var(--text)" }}>
          <input type="checkbox" name="did_minimum_only" defaultChecked={task.did_minimum_only ?? false} /> 只完成了最低行动（同样算数）
        </label>
      ) : null}

      {showOutput ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted small">实际产出到了哪一步</legend>
          <div className="chips">
            {OUTPUTS.map((o) => (
              <label key={o} className="chip">
                <input type="radio" name="output_level" value={o} defaultChecked={task.output_level === o} />
                <span>{OUTPUT_LABEL[o]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {showObstacle ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="muted small">{status === "partial" ? "卡在哪里（可选）" : "什么挡住了开始"}</legend>
          <div className="chips">
            {OBSTACLES.map((o) => (
              <label key={o} className="chip">
                <input type="radio" name="obstacle" value={o} defaultChecked={task.obstacle === o} />
                <span>{OBSTACLE_LABEL[o]}</span>
              </label>
            ))}
          </div>
          <input type="text" name="obstacle_note" placeholder="补充一句（可选）" defaultValue={task.obstacle_note ?? ""} maxLength={1000} style={{ marginTop: 8 }} />
        </fieldset>
      ) : null}

      {status === "deferred" ? (
        <div>
          <label htmlFor={`defer-${task.id}`}>延后到</label>
          <input id={`defer-${task.id}`} type="date" name="defer_to" min={today} defaultValue={task.defer_to ?? addDays(today, 1)} />
        </div>
      ) : null}

      {status ? (
        <div>
          <label htmlFor={`note-${task.id}`}>实际结果（可选，可以用键盘上的麦克风说）</label>
          <textarea id={`note-${task.id}`} name="result_note" defaultValue={task.result_note ?? ""} maxLength={2000} placeholder="例如：写完了第二个论点，600 字" />
        </div>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary block" type="submit" disabled={pending || !status}>
        {pending ? "保存中…" : "保存结果"}
      </button>
    </form>
  );
}
