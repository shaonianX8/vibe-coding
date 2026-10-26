import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ensureProfile, getActiveStrategy, listBeliefs, listStrategyVersions } from "@/lib/data/repo";
import { localDate } from "@/lib/domain/time";
import { isAiConfigured } from "@/lib/ai/followup";
import { ActionForm } from "@/components/ActionForm";
import { PushManager } from "@/components/PushManager";
import { logout } from "@/app/login/actions";
import { addBelief, confirmTemplate, deleteMyData, restoreVersion, saveSettings, saveStrategy, updateBelief } from "./actions";

export const dynamic = "force-dynamic";

const BELIEF_KIND = { fact: "事实", hypothesis: "待验证假设", constraint: "现实约束" } as const;
const BELIEF_SOURCE = { user_confirmed: "你确认的", system_observed: "系统记录", imported: "外部导入", ai_inferred: "AI 推测" } as const;
const VERSION_SOURCE = { template: "初始模板", user: "你修改", restore: "恢复旧版", ai_proposal: "AI 提案" } as const;

export default async function DirectionPage() {
  const { supabase, user } = await requireUser();
  const profile = await ensureProfile(supabase, user.id);
  const today = localDate(new Date(), profile.timezone);
  const [active, versions, beliefs] = await Promise.all([getActiveStrategy(supabase), listStrategyVersions(supabase), listBeliefs(supabase)]);
  const s = active.content;
  const lastChange = versions.find((v) => v.source !== "template") ?? null;
  const unconfirmed = active.source === "template" && !active.confirmed_by_user;

  return (
    <>
      <h1>方向</h1>

      {unconfirmed ? (
        <div className="card warn">
          <p className="small">下面的战略来自初始模板，还没有经过你确认。它是起点，不是永久事实。</p>
          <form action={confirmTemplate}>
            <button className="primary" type="submit">
              我确认这份战略
            </button>
          </form>
        </div>
      ) : null}

      <section className="card">
        <div className="kicker">人生终局</div>
        <p>{s.endgame}</p>
        <h3>价值原则（相对稳定）</h3>
        <div className="chips">
          {s.principles.map((p) => (
            <span key={p} className="tag">
              {p}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="kicker">2036 长期战略</div>
        <p>{s.strategy2036}</p>
        <h3>长期研究主题</h3>
        <p className="small">{s.researchTheme}</p>
        <ul className="dots small">
          {s.researchAreas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <h3>通向长期目标的必要条件</h3>
        <p className="small">{s.necessaryConditions.join("、")}</p>
        <p className="muted small">每项条件的状态评估（未建立 / 萌芽 / 稳定 / 可扩展）在季度复盘中依据证据判断，V2 加入。</p>
      </section>

      <section className="card">
        <div className="kicker">当前阶段</div>
        <h2>{s.stage.name}</h2>
        <p className="muted small">{s.stage.period}</p>
        <ol className="small" style={{ paddingLeft: 20 }}>
          {s.stage.priorities.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <div className="kicker">当前季度重点 · {s.quarterFocus.label}</div>
        <p className="small">
          <strong>现实责任：</strong>
          {s.quarterFocus.reality.goal}
        </p>
        <p className="small">
          <strong>长期积累：</strong>
          {s.quarterFocus.longTerm.goal}
        </p>
        {s.quarterFocus.health ? (
          <p className="small">
            <strong>健康与必要事项：</strong>
            {s.quarterFocus.health}
          </p>
        ) : null}
        <h3>当前主要限制因素</h3>
        {s.mainConstraint ? (
          <>
            <p className="small">{s.mainConstraint.statement}</p>
            {s.mainConstraint.why ? <p className="muted small">为什么最重要：{s.mainConstraint.why}</p> : null}
            {s.mainConstraint.evidence ? <p className="muted small">证据：{s.mainConstraint.evidence}</p> : null}
          </>
        ) : (
          <p className="muted small">尚未判断。数据不足时系统不下结论，你可以在下方手动填写。</p>
        )}
      </section>

      <section className="card">
        <div className="kicker">最近一次战略调整</div>
        {lastChange ? (
          <p className="small">
            第 {lastChange.version} 版 · {lastChange.created_at.slice(0, 10)} · {lastChange.change_summary}
            <br />
            <span className="muted">原因：{lastChange.change_reason}</span>
          </p>
        ) : (
          <p className="muted small">还没有调整过。</p>
        )}
        <details>
          <summary>修改战略（会保存为新版本）</summary>
          <ActionForm action={saveStrategy} submitLabel="保存为新版本">
            <Field name="q_label" label="季度名称" value={s.quarterFocus.label} />
            <Field name="q_reality_goal" label="季度现实责任" value={s.quarterFocus.reality.goal} />
            <Field name="q_reality_first" label="默认第一步" value={s.quarterFocus.reality.first_step} />
            <Field name="q_reality_min" label="默认最低行动" value={s.quarterFocus.reality.minimum} />
            <Field name="q_long_goal" label="季度长期积累" value={s.quarterFocus.longTerm.goal} />
            <Field name="q_long_first" label="默认第一步" value={s.quarterFocus.longTerm.first_step} />
            <Field name="q_long_min" label="默认最低行动" value={s.quarterFocus.longTerm.minimum} />
            <Field name="q_health" label="健康与必要事项" value={s.quarterFocus.health} />
            <Field name="constraint_statement" label="当前主要限制因素" value={s.mainConstraint?.statement ?? ""} />
            <Field name="constraint_why" label="为什么它比其他问题更重要" value={s.mainConstraint?.why ?? ""} area />
            <Field name="constraint_evidence" label="支持证据" value={s.mainConstraint?.evidence ?? ""} area />
            <Field name="stage_name" label="阶段名称" value={s.stage.name} />
            <Field name="stage_period" label="阶段时间" value={s.stage.period} />
            <Field name="stage_priorities" label="阶段优先级（每行一条）" value={s.stage.priorities.join("\n")} area />
            <Field name="endgame" label="人生终局" value={s.endgame} area />
            <Field name="principles" label="价值原则（每行一条）" value={s.principles.join("\n")} area />
            <Field name="strategy2036" label="2036 长期战略" value={s.strategy2036} area />
            <Field name="researchTheme" label="长期研究主题" value={s.researchTheme} area />
            <Field name="researchAreas" label="重点研究领域（每行一条）" value={s.researchAreas.join("\n")} area />
            <div>
              <label htmlFor="change_reason">修改原因（必填）</label>
              <textarea id="change_reason" name="change_reason" required maxLength={1000} />
            </div>
            <Field name="evidence" label="支持证据（可选）" value="" area />
          </ActionForm>
        </details>
        <details>
          <summary>历史版本（{versions.length}）</summary>
          <ul className="plain small">
            {versions.map((v) => (
              <li key={v.id}>
                <div className="spread">
                  <span>
                    第 {v.version} 版 · {v.created_at.slice(0, 10)} · {VERSION_SOURCE[v.source]}
                    {v.status === "active" ? <span className="tag ok"> 当前</span> : null}
                  </span>
                  {v.status !== "active" && v.source !== "ai_proposal" ? (
                    <form action={restoreVersion}>
                      <input type="hidden" name="version" value={v.version} />
                      <button type="submit" className="small">
                        恢复
                      </button>
                    </form>
                  ) : null}
                </div>
                {v.change_summary ? <span className="muted">{v.change_summary}</span> : null}
                {v.change_reason ? <span className="muted">；原因：{v.change_reason}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="card">
        <div className="kicker">事实、假设与约束</div>
        <p className="muted small">个人背景、行为假设和现实约束放在这里，只存在你的私有数据库里。假设可以被新证据推翻。</p>
        {beliefs.filter((b) => b.is_valid).length === 0 ? <p className="muted small">还没有记录。</p> : null}
        <ul className="plain small">
          {beliefs
            .filter((b) => b.is_valid)
            .map((b) => {
              const stale = b.review_after !== null && b.review_after < today;
              return (
                <li key={b.id}>
                  <span className="tag">{BELIEF_KIND[b.kind]}</span> {stale ? <span className="tag warn">已过复查日，待确认</span> : null} {b.statement}
                  <div className="muted">
                    来源：{BELIEF_SOURCE[b.source]}
                    {b.review_after ? ` · 复查日 ${b.review_after}` : ""}
                    {b.evidence ? ` · 证据：${b.evidence}` : ""}
                  </div>
                  <div className="row">
                    {stale ? (
                      <form action={updateBelief} className="row">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="op" value="reconfirm" />
                        <input type="date" name="review_after" aria-label="新的复查日" style={{ width: "auto" }} />
                        <button type="submit" className="small">
                          仍然成立
                        </button>
                      </form>
                    ) : null}
                    <form action={updateBelief}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="op" value="invalidate" />
                      <button type="submit" className="small">
                        不再成立
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
        </ul>
        <details>
          <summary>添加一条</summary>
          <form action={addBelief} className="stack">
            <div>
              <label htmlFor="belief-kind">类型</label>
              <select id="belief-kind" name="kind" defaultValue="hypothesis">
                <option value="hypothesis">待验证假设（例如关于自己行为的推测）</option>
                <option value="constraint">现实约束（例如某笔款项的到期日）</option>
                <option value="fact">事实（你确认属实）</option>
              </select>
            </div>
            <div>
              <label htmlFor="belief-statement">内容</label>
              <textarea id="belief-statement" name="statement" required maxLength={2000} />
            </div>
            <div>
              <label htmlFor="belief-review">复查日（过期后会提示你重新确认）</label>
              <input id="belief-review" type="date" name="review_after" />
            </div>
            <div>
              <label htmlFor="belief-evidence">证据（可选）</label>
              <input id="belief-evidence" type="text" name="evidence" maxLength={1000} />
            </div>
            <button type="submit" className="primary">
              添加
            </button>
          </form>
        </details>
      </section>

      <section className="card">
        <div className="kicker">提醒设置</div>
        <ActionForm action={saveSettings} submitLabel="保存设置">
          <div className="grid2">
            <div>
              <label htmlFor="reminder_time">每日提醒时间</label>
              <input id="reminder_time" type="time" name="reminder_time" defaultValue={profile.reminder_time.slice(0, 5)} required />
            </div>
            <div>
              <label htmlFor="timezone">时区</label>
              <input id="timezone" type="text" name="timezone" defaultValue={profile.timezone} required />
            </div>
          </div>
          <label className="row" style={{ color: "var(--text)" }}>
            <input type="checkbox" name="reminders_enabled" defaultChecked={profile.reminders_enabled} /> 开启每日提醒
          </label>
          <div>
            <label htmlFor="pause">暂停提醒到（含这一天，留空表示不暂停）</label>
            <input id="pause" type="date" name="reminders_paused_until" defaultValue={profile.reminders_paused_until ?? ""} />
          </div>
          <p className="muted small">每天最多一条主提醒；当天已经确认计划就不会再发；没有响应也不会加发。</p>
        </ActionForm>
        <h3>这台设备的通知</h3>
        <PushManager vapidPublicKey={env.vapid()?.publicKey ?? null} />
      </section>

      <section className="card">
        <div className="kicker">数据</div>
        <p className="small">AI 分析：{isAiConfigured() ? "已配置" : "未配置（所有基础功能照常使用）"}</p>
        <p className="small">
          <a href="/setup">部署助手：生成推送密钥与定时任务设置</a>
        </p>
        <p>
          <a className="button" href="/api/export">
            导出我的全部数据（JSON）
          </a>
        </p>
        <details>
          <summary>删除我的全部数据</summary>
          <ActionForm action={deleteMyData} submitLabel="永久删除" danger>
            <p className="small">会删除任务、记录、战略版本、假设、通知记录。无法恢复，建议先导出。登录账户本身保留。</p>
            <div>
              <label htmlFor="confirm-delete">输入：删除我的全部数据</label>
              <input id="confirm-delete" type="text" name="confirm" autoComplete="off" />
            </div>
          </ActionForm>
        </details>
        <form action={logout} style={{ marginTop: 12 }}>
          <button type="submit">退出登录</button>
        </form>
        <p className="muted small">登录账户：{user.email}</p>
      </section>
    </>
  );
}

function Field({ name, label, value, area = false }: { name: string; label: string; value: string; area?: boolean }) {
  return (
    <div>
      <label htmlFor={`f-${name}`}>{label}</label>
      {area ? <textarea id={`f-${name}`} name={name} defaultValue={value} maxLength={2000} /> : <input id={`f-${name}`} type="text" name={name} defaultValue={value} maxLength={500} />}
    </div>
  );
}
