import { requireUser } from "@/lib/auth";
import { ensureProfile, getAlertFeedback, getDailyLogsSince, getTasksSince } from "@/lib/data/repo";
import { computeAlerts } from "@/lib/domain/alerts";
import { summarizeWeek } from "@/lib/domain/weekly";
import { addDays, formatCnDate, localDate, previousWeek } from "@/lib/domain/time";
import { KIND_LABEL, MODE_LABEL, OBSTACLE_LABEL, OUTPUT_LABEL, STATUS_LABEL } from "@/lib/domain/types";
import { OutcomeForm } from "@/components/OutcomeForm";
import { alertFeedback } from "./actions";

export const dynamic = "force-dynamic";

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export default async function RecordsPage() {
  const { supabase, user } = await requireUser();
  const profile = await ensureProfile(supabase, user.id);
  const today = localDate(new Date(), profile.timezone);
  const [tasks, logs, feedback, notes] = await Promise.all([
    getTasksSince(supabase, addDays(today, -90)),
    getDailyLogsSince(supabase, addDays(today, -30)),
    getAlertFeedback(supabase, addDays(today, -180)),
    supabase.from("notifications").select("status,opened_at,kind").eq("kind", "daily_plan").gte("local_date", addDays(today, -27)),
  ]);
  const alerts = computeAlerts({ today, tasks, logs, feedback });
  const week = summarizeWeek(today, tasks, logs);
  const unrecorded = tasks.filter((t) => t.status === "planned" && t.local_date < today && t.local_date >= addDays(today, -7));
  const obstacles = tasks.filter((t) => t.status === "not_started" && t.local_date >= addDays(today, -14));

  // 工具自检：记录负担与提醒效果（最近 28 天），作为基线
  const recent = logs.filter((l) => l.local_date >= addDays(today, -27)) as Array<{ plan_seconds?: number | null; review_seconds?: number | null }>;
  const planSec = median(recent.map((l) => l.plan_seconds).filter((x): x is number => typeof x === "number"));
  const reviewSec = median(recent.map((l) => l.review_seconds).filter((x): x is number => typeof x === "number"));
  const pushes = (notes.data ?? []).filter((n) => n.status === "accepted");
  const opened = pushes.filter((n) => n.opened_at).length;

  return (
    <>
      <h1>记录</h1>

      {alerts.map((a) => (
        <section key={a.key} className="card warn" aria-label="预警">
          <div className="kicker">预警（规则判断）</div>
          <h2>{a.title}</h2>
          <h3>观察到的事实</h3>
          <ul className="dots small">
            {a.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {a.evidence.length ? (
            <details>
              <summary>证据（{a.evidence.length} 条记录）</summary>
              <ul className="plain small">
                {a.evidence.map((e, i) => (
                  <li key={i}>
                    {e.date}　{e.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <h3>可能的解释</h3>
          <ul className="dots small">
            {a.explanations.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <h3>尚不清楚</h3>
          <ul className="dots small">
            {a.unknowns.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <h3>建议的最小调整</h3>
          <p className="small">{a.adjustment}</p>
          <p className="muted small">建议在 {a.recheckOn} 复查。</p>
          <form action={alertFeedback} className="row">
            <input type="hidden" name="alert_key" value={a.key} />
            <button type="submit" name="verdict" value="inaccurate" className="small">
              这条不准确
            </button>
            <button type="submit" name="verdict" value="useful" className="small">
              有帮助
            </button>
          </form>
        </section>
      ))}

      <section className="card">
        <h2>最近 7 天</h2>
        {!week.hasData ? (
          <p className="muted">还没有记录。没有数据时，系统不做判断。</p>
        ) : (
          <>
            <div className="grid2">
              <div>
                <div className="muted small">现实责任</div>
                <div className="stat">
                  {week.reality.done}
                  <span className="muted small"> / {week.reality.planned} 完成</span>
                </div>
                {week.reality.partial ? <div className="muted small">另有 {week.reality.partial} 次部分完成</div> : null}
              </div>
              <div>
                <div className="muted small">长期积累</div>
                <div className="stat">
                  {week.longTerm.done}
                  <span className="muted small"> / {week.longTerm.planned} 完成</span>
                </div>
                {week.longTerm.partial ? <div className="muted small">另有 {week.longTerm.partial} 次部分完成</div> : null}
              </div>
            </div>
            <p className="small">原创交付：{week.originalDeliveries} 次（只统计标记为原创、产出达到交付级的任务）</p>
            {week.topObstacles.length ? <p className="small">反复出现的障碍：{week.topObstacles.map((o) => `${o.label} ${o.count} 次`).join("，")}</p> : null}
            {week.workingAdjustments.length ? (
              <p className="small">
                有效过的调整：{week.workingAdjustments.map((a) => `${a.label}（${a.succeeded}/${a.tried}）`).join("，")}
              </p>
            ) : null}
          </>
        )}
      </section>

      {unrecorded.length ? (
        <section className="card">
          <h2>补记结果</h2>
          {unrecorded.map((t) => (
            <details key={t.id}>
              <summary>
                {formatCnDate(t.local_date)}　{t.title}
              </summary>
              <OutcomeForm task={t} today={today} />
            </details>
          ))}
        </section>
      ) : null}

      <section className="card">
        <h2>每日记录</h2>
        <ul className="plain">
          {week.days.map((d) => (
            <li key={d.date}>
              <div className="spread">
                <strong className="small">{formatCnDate(d.date)}</strong>
                {d.log && d.log.mode !== "normal" ? <span className="tag">{MODE_LABEL[d.log.mode]}</span> : null}
              </div>
              {d.tasks.length === 0 ? (
                <p className="muted small">没有记录</p>
              ) : (
                d.tasks.map((t) => (
                  <p key={t.id} className="small">
                    <span className={`tag ${t.status === "done" ? "ok" : t.status === "not_started" ? "warn" : ""}`}>{STATUS_LABEL[t.status]}</span> {KIND_LABEL[t.kind]}：{t.title}
                    {t.output_level ? <span className="muted">（{OUTPUT_LABEL[t.output_level]}）</span> : null}
                    {t.result_note ? <span className="muted"> {t.result_note}</span> : null}
                  </p>
                ))
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>最近两周未开始的障碍</h2>
        {obstacles.length === 0 ? (
          <p className="muted small">没有。</p>
        ) : (
          <ul className="plain small">
            {obstacles.map((t) => (
              <li key={t.id}>
                {t.local_date}　{t.title}：{t.obstacle ? OBSTACLE_LABEL[t.obstacle] : "未填写原因"}
                {t.obstacle_note ? `，${t.obstacle_note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>工具自检</h2>
        <p className="muted small">这个应用也要接受检验：如果记录负担变大而行动没有改善，应该简化它。</p>
        <ul className="dots small">
          <li>确认计划耗时中位数：{planSec === null ? "暂无数据" : `${planSec} 秒`}</li>
          <li>记录结果耗时中位数：{reviewSec === null ? "暂无数据" : `${reviewSec} 秒`}</li>
          <li>
            最近 28 天每日提醒：推送服务接收 {pushes.length} 次，被点开 {opened} 次
          </li>
        </ul>
        <p className="muted small">上一个完整自然周：{previousWeek(today).label}。完整的周复盘在 V1 加入。</p>
      </section>
    </>
  );
}
