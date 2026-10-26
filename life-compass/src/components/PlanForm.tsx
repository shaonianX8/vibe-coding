"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanSlot } from "@/lib/domain/planner";
import { KIND_LABEL } from "@/lib/domain/types";
import { confirmPlan } from "@/app/(app)/today/actions";
import { TaskFields, type TaskFieldValues } from "./TaskFields";
import { clearFormDraft, useFormDraft } from "./useFormDraft";

function valuesOf(slot: PlanSlot): TaskFieldValues {
  const src = slot.existing ?? slot.draft;
  return {
    title: src?.title ?? "",
    start_time: src?.start_time ?? null,
    place: src?.place ?? null,
    first_step: src?.first_step ?? null,
    full_goal: src?.full_goal ?? null,
    minimum_action: src?.minimum_action ?? null,
    due_date: src?.due_date ?? null,
    is_original_work: src?.is_original_work ?? slot.kind === "long_term",
  };
}

export function PlanForm({ slots, today }: { slots: PlanSlot[]; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [openedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const draftKey = `lc-plan-${today}`;
  useFormDraft(formRef, draftKey);

  async function submit(fd: FormData) {
    setPending(true);
    setError(null);
    try {
      const res = await confirmPlan(fd);
      if (res.ok) {
        clearFormDraft(draftKey);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("网络中断，计划没有保存。内容已暂存在这台手机上，联网后再点一次即可。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} action={submit}>
      <input type="hidden" name="opened_at" value={openedAt} />
      {slots.map((slot) => {
        const d = slot.existing ?? slot.draft;
        const prefix = `${slot.kind}.`;
        return (
          <section key={slot.kind} className="card" aria-label={KIND_LABEL[slot.kind]}>
            <div className="spread">
              <span className="kicker">{slot.kind === "reality" ? "最重要的现实责任" : "最重要的长期积累"}</span>
              {slot.optional ? (
                <label className="row small" style={{ margin: 0 }}>
                  <input type="checkbox" name={`${prefix}include`} defaultChecked /> 今天安排
                </label>
              ) : null}
            </div>
            {slot.optional ? <input type="hidden" name={`${prefix}optional`} value="1" /> : null}
            {slot.hint ? <p className="muted small">{slot.hint}</p> : null}
            {slot.draft?.origin_note ? <p className="muted small">{slot.draft.origin_note}</p> : null}
            <input type="hidden" name={`${prefix}carried_from_task_id`} value={(slot.existing?.carried_from_task_id ?? slot.draft?.carried_from_task_id) || ""} />
            <input type="hidden" name={`${prefix}adjustment`} value={d?.adjustment ?? "none"} />
            <input type="hidden" name={`${prefix}source`} value={slot.existing?.source ?? slot.draft?.source ?? "user"} />
            <TaskFields kind={slot.kind} values={valuesOf(slot)} prefix={prefix} highlightFirstStep={d?.adjustment === "define_first_step" && !d.first_step} required={!slot.optional} />
          </section>
        );
      })}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary block" type="submit" disabled={pending}>
        {pending ? "保存中…" : "确认今天的计划"}
      </button>
      <p className="muted small" style={{ textAlign: "center" }}>
        已经帮你预填，确认或改几个字就好。
      </p>
    </form>
  );
}
