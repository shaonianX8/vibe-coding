// 任务字段：计划、修改、采纳建议时共用。常用字段在外，其余收在「更多」里，控制填写负担。
import type { TaskKind } from "@/lib/domain/types";

export interface TaskFieldValues {
  title: string;
  start_time: string | null;
  place: string | null;
  first_step: string | null;
  full_goal: string | null;
  minimum_action: string | null;
  due_date: string | null;
  is_original_work: boolean;
}

export function TaskFields({
  kind,
  values,
  prefix = "",
  highlightFirstStep = false,
  required = true,
}: {
  kind: TaskKind;
  values: TaskFieldValues;
  prefix?: string;
  highlightFirstStep?: boolean;
  required?: boolean;
}) {
  const id = (k: string) => `${prefix}${k}`.replace(/\./g, "-");
  return (
    <div className="stack">
      <div>
        <label htmlFor={id("title")}>做什么</label>
        <input id={id("title")} name={`${prefix}title`} type="text" defaultValue={values.title} required={required} maxLength={500} />
      </div>
      <div>
        <label htmlFor={id("first_step")}>{highlightFirstStep ? "第一步（请写一个 2 分钟内能开始的动作）" : "第一个动作"}</label>
        <input id={id("first_step")} name={`${prefix}first_step`} type="text" defaultValue={values.first_step ?? ""} maxLength={500} autoFocus={highlightFirstStep} />
      </div>
      <div className="grid2">
        <div>
          <label htmlFor={id("start_time")}>几点开始</label>
          <input id={id("start_time")} name={`${prefix}start_time`} type="time" defaultValue={values.start_time?.slice(0, 5) ?? ""} />
        </div>
        <div>
          <label htmlFor={id("place")}>在哪里</label>
          <input id={id("place")} name={`${prefix}place`} type="text" defaultValue={values.place ?? ""} maxLength={200} />
        </div>
      </div>
      <details>
        <summary>完整目标与最低行动</summary>
        <div className="stack">
          <div>
            <label htmlFor={id("full_goal")}>完整目标</label>
            <textarea id={id("full_goal")} name={`${prefix}full_goal`} defaultValue={values.full_goal ?? ""} maxLength={1000} />
          </div>
          <div>
            <label htmlFor={id("minimum_action")}>最低行动（时间精力不够时，做这个也算数）</label>
            <input id={id("minimum_action")} name={`${prefix}minimum_action`} type="text" defaultValue={values.minimum_action ?? ""} maxLength={500} />
          </div>
          {kind === "reality" ? (
            <div>
              <label htmlFor={id("due_date")}>现实截止日期（可选）</label>
              <input id={id("due_date")} name={`${prefix}due_date`} type="date" defaultValue={values.due_date ?? ""} />
            </div>
          ) : null}
          <label className="row" style={{ color: "var(--text)" }}>
            <input type="checkbox" name={`${prefix}is_original_work`} defaultChecked={values.is_original_work} /> 这是原创作品（研究工具、整理工作流不算）
          </label>
        </div>
      </details>
    </div>
  );
}
