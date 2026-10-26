import { requireUser } from "@/lib/auth";
import { ensureDailyLog, ensureProfile, getActiveStrategy, getDailyLogsSince, getTasksSince } from "@/lib/data/repo";
import { planToday } from "@/lib/domain/planner";
import { suggestFollowup } from "@/lib/domain/followup";
import { suggestMode } from "@/lib/domain/mode";
import { addDays, formatCnDate, localDate } from "@/lib/domain/time";
import { MODE_LABEL, type Mode, type Task } from "@/lib/domain/types";
import { isAiConfigured } from "@/lib/ai/followup";
import type { FollowupAiOutput } from "@/lib/ai/provider";
import { PlanForm } from "@/components/PlanForm";
import { TaskCard } from "@/components/TaskCard";
import { setDayState, setMode } from "./actions";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { supabase, user } = await requireUser();
  const { src } = await searchParams;
  const profile = await ensureProfile(supabase, user.id);
  const today = localDate(new Date(), profile.timezone);

  const [strategy, tasks, logs] = await Promise.all([getActiveStrategy(supabase), getTasksSince(supabase, addDays(today, -90)), getDailyLogsSince(supabase, addDays(today, -14))]);
  const todayLog = await ensureDailyLog(supabase, user.id, today, profile.current_mode, src === "push");
  const mode = profile.current_mode;
  const plan = planToday({ today, mode, tasks, focus: strategy.content.quarterFocus });
  const modeTip = suggestMode({
    current: mode,
    modeChangedOn: localDate(new Date(profile.mode_changed_at), profile.timezone),
    today,
    todayLog,
    recentLogs: logs,
    tasks,
  });

  const todayTasks = (["reality", "long_term"] as const).map((k) => plan[k].existing).filter((t): t is Task => t !== null);
  // 补记：昨天还没记录结果的任务
  const yesterdayOpen = tasks.filter((t) => t.local_date === addDays(today, -1) && t.status === "planned");
  const cardTasks = [...todayTasks, ...yesterdayOpen];

  const recordedIds = cardTasks.filter((t) => t.status !== "planned" && !t.followup_decision).map((t) => t.id);
  const aiRows = recordedIds.length
    ? ((await supabase.from("ai_suggestions").select("id,task_id,output,model").in("task_id", recordedIds).eq("status", "pending").order("created_at", { ascending: false })).data ?? [])
    : [];
  const aiEnabled = isAiConfigured();
  const planned = Boolean(todayLog.plan_confirmed_at);

  return (
    <>
      <header>
        <div className="kicker">{formatCnDate(today)}</div>
        <h1>今天</h1>
        <p className="muted small">当前阶段：{strategy.content.stage.name}</p>
      </header>

      <div className="card">
        <div className="spread">
          <span>
            <strong>{MODE_LABEL[mode]}</strong>
          </span>
          <details>
            <summary>切换</summary>
            <form action={setMode} className="row">
              {(Object.keys(MODE_LABEL) as Mode[])
                .filter((m) => m !== mode)
                .map((m) => (
                  <button key={m} type="submit" name="mode" value={m} className="small">
                    {MODE_LABEL[m]}
                  </button>
                ))}
            </form>
          </details>
        </div>
        {modeTip ? (
          <p className="small" style={{ color: "var(--warn)" }}>
            建议考虑切换到{MODE_LABEL[modeTip.suggested]}：{modeTip.reason}这只是建议，由你决定。
          </p>
        ) : null}
        <form action={setDayState} className="row small" style={{ marginTop: 6 }}>
          <span className="muted">今天精力（可跳过）</span>
          {[
            [1, "低"],
            [2, "中"],
            [3, "高"],
          ].map(([v, l]) => (
            <button key={v} type="submit" name="energy" value={v} className="small" aria-pressed={todayLog.energy === v} style={todayLog.energy === v ? { background: "var(--accent-soft)" } : undefined}>
              {l}
            </button>
          ))}
          <button type="submit" name="unwell" value={todayLog.unwell ? "false" : "true"} className="small" aria-pressed={todayLog.unwell}>
            {todayLog.unwell ? "已标记身体不适" : "身体不适"}
          </button>
        </form>
      </div>

      {!planned ? (
        <PlanForm slots={[plan.reality, plan.long_term]} today={today} />
      ) : (
        <>
          {cardTasks.length === 0 ? <p className="muted">今天没有安排关键任务。</p> : null}
          {cardTasks.map((t) => {
            const ai = aiRows.find((r) => r.task_id === t.id);
            return (
              <div key={t.id}>
                {t.local_date !== today ? <p className="muted small">昨天的任务还没记录结果：</p> : null}
                <TaskCard
                  task={t}
                  today={today}
                  history={tasks}
                  timezone={profile.timezone}
                  suggestion={t.status !== "planned" ? suggestFollowup(t, tasks, today) : null}
                  aiEnabled={aiEnabled}
                  ai={ai ? { id: ai.id as string, output: ai.output as FollowupAiOutput, model: ai.model as string } : null}
                />
              </div>
            );
          })}
          {(["reality", "long_term"] as const).map((k) =>
            !plan[k].existing && plan[k].hint ? (
              <p key={k} className="muted small">
                {plan[k].hint}
              </p>
            ) : null,
          )}
        </>
      )}

      {strategy.content.quarterFocus.health ? (
        <div className="card">
          <div className="kicker">必要事项</div>
          <p className="small">{strategy.content.quarterFocus.health}</p>
        </div>
      ) : null}
    </>
  );
}
