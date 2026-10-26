-- Life Compass V0 初始数据结构
-- 原则：
-- 1. 每张表都有 user_id，并用 RLS 保证只能读写自己的数据。
-- 2. 重要记录区分 发生时间（local_date / occurred）与 记录时间（created_at），并标明来源 source。
-- 3. AI 只能写入 proposed 状态的内容，永远不能直接成为生效的战略或事实。

-- ---------------------------------------------------------------
-- 通用：updated_at 自动维护
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 用户设置
-- ---------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Shanghai',
  reminder_time time not null default '10:00',
  reminders_enabled boolean not null default true,
  reminders_paused_until date,
  current_mode text not null default 'normal'
    check (current_mode in ('normal', 'emergency', 'recovery')),
  mode_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 长期战略（版本化）：人生终局、价值原则、2036 战略、阶段、季度重点、主要限制因素
-- ---------------------------------------------------------------
create table public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  status text not null check (status in ('active', 'archived', 'proposed', 'rejected')),
  content jsonb not null,
  change_summary text,
  change_reason text,
  evidence text,
  source text not null check (source in ('template', 'user', 'restore', 'ai_proposal')),
  confirmed_by_user boolean not null default false,
  confirmed_at timestamptz,
  based_on_version integer,
  created_at timestamptz not null default now(),
  unique (user_id, version),
  -- AI 提案永远不能直接生效：只能是 proposed 或 rejected
  constraint ai_never_active check (source <> 'ai_proposal' or status in ('proposed', 'rejected'))
);
create unique index strategy_one_active_per_user
  on public.strategy_versions (user_id) where status = 'active';

-- 原子地保存一个新版本：旧 active 归档，新版本生效。security invoker，RLS 照常生效。
create or replace function public.save_strategy_version(
  p_content jsonb,
  p_change_summary text,
  p_change_reason text,
  p_evidence text,
  p_source text,
  p_based_on integer
)
returns public.strategy_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_next integer;
  v_row public.strategy_versions;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_source not in ('template', 'user', 'restore') then
    raise exception 'invalid source for active strategy: %', p_source;
  end if;
  if p_source <> 'template' and coalesce(btrim(p_change_reason), '') = '' then
    raise exception 'change reason required';
  end if;

  -- 同一用户串行化，避免并发保存产生两个 active
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select coalesce(max(version), 0) + 1 into v_next
    from public.strategy_versions where user_id = v_uid;

  update public.strategy_versions
     set status = 'archived'
   where user_id = v_uid and status = 'active';

  insert into public.strategy_versions (
    user_id, version, status, content, change_summary, change_reason, evidence,
    source, confirmed_by_user, confirmed_at, based_on_version
  ) values (
    v_uid, v_next, 'active', p_content, p_change_summary, p_change_reason, p_evidence,
    p_source, p_source <> 'template', case when p_source <> 'template' then now() end, p_based_on
  ) returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------
-- 事实 / 假设 / 约束：明确区分来源与确认状态
-- ---------------------------------------------------------------
create table public.beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('fact', 'hypothesis', 'constraint')),
  statement text not null check (char_length(statement) between 1 and 2000),
  source text not null check (source in ('user_confirmed', 'system_observed', 'imported', 'ai_inferred')),
  confirmed_by_user boolean not null default false,
  is_valid boolean not null default true,
  valid_from date,
  valid_until date,
  review_after date,
  evidence text,
  invalidated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- AI 推测只能是假设，不能以事实或约束的身份写入
  constraint ai_inference_is_hypothesis check (source <> 'ai_inferred' or kind = 'hypothesis')
);
create index beliefs_user_idx on public.beliefs (user_id, kind);
create trigger beliefs_touch before update on public.beliefs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 每日关键任务与执行结果
-- ---------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('reality', 'long_term')),
  title text not null check (char_length(title) between 1 and 500),
  start_time time,
  place text,
  first_step text,
  full_goal text,
  minimum_action text,
  due_date date,
  is_original_work boolean not null default false,
  status text not null default 'planned'
    check (status in ('planned', 'done', 'partial', 'not_started', 'cancelled', 'deferred')),
  started_at timestamptz,
  -- 区分 思考 / 计划 / 准备 / 执行 / 交付 / 结果，避免把准备算成作品
  output_level text
    check (output_level in ('thinking', 'planning', 'preparing', 'executing', 'delivered', 'result')),
  did_minimum_only boolean,
  result_note text,
  obstacle text
    check (obstacle in ('too_big', 'bad_time', 'resource_conflict', 'no_first_step',
                        'health_emotion', 'need_external', 'not_worth', 'other')),
  obstacle_note text,
  defer_to date,
  carried_from_task_id uuid references public.tasks (id) on delete set null,
  adjustment text not null default 'none'
    check (adjustment in ('none', 'continue', 'carry_remaining', 'shrink', 'reschedule',
                          'define_first_step', 'external_commitment', 'recovery_minimum',
                          'reprioritize', 'review_goal')),
  source text not null default 'user'
    check (source in ('user', 'carry_over', 'strategy_default', 'rule_suggestion', 'ai_suggestion')),
  outcome_recorded_at timestamptz,
  -- 用户对「下一步建议」的处理：采纳 / 修改后采纳 / 拒绝 / 已知悉
  followup_decision text check (followup_decision in ('accepted', 'modified', 'rejected', 'acknowledged')),
  followup_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_date_idx on public.tasks (user_id, local_date desc);
-- 每天每类只有一个有效关键任务（取消的不算），也让重复生成天然幂等
create unique index tasks_one_per_kind_per_day
  on public.tasks (user_id, local_date, kind) where status <> 'cancelled';
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 每日状态
-- ---------------------------------------------------------------
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  mode text not null check (mode in ('normal', 'emergency', 'recovery')),
  energy smallint check (energy between 1 and 3),
  unwell boolean not null default false,
  note text,
  first_opened_at timestamptz,
  opened_from_push boolean not null default false,
  plan_confirmed_at timestamptz,
  plan_seconds integer check (plan_seconds >= 0),
  review_seconds integer check (review_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create trigger daily_logs_touch before update on public.daily_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 推送订阅与通知记录
-- ---------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  disabled_at timestamptz,
  disabled_reason text,
  unique (user_id, endpoint)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('daily_plan', 'test')),
  local_date date not null,
  dedupe_key text not null,
  -- accepted = 推送服务已接收，不等于用户已收到；只有 opened_at 代表用户点开了
  status text not null check (status in ('pending', 'accepted', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0,
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_date_idx on public.notifications (user_id, local_date desc);

-- ---------------------------------------------------------------
-- AI 建议（可接受、修改、拒绝）与调用计量
-- ---------------------------------------------------------------
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  purpose text not null check (purpose in ('followup')),
  output jsonb not null,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'modified', 'rejected')),
  user_feedback text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_suggestions_task_idx on public.ai_suggestions (task_id);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null,
  model text not null,
  ok boolean not null,
  error_code text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------
-- 预警反馈：用户标注预警不准确，系统据此暂停同类预警
-- ---------------------------------------------------------------
create table public.alert_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_key text not null,
  verdict text not null check (verdict in ('inaccurate', 'useful')),
  note text,
  local_date date not null,
  created_at timestamptz not null default now()
);
create index alert_feedback_user_idx on public.alert_feedback (user_id, alert_key, local_date desc);

-- ---------------------------------------------------------------
-- 行级安全：所有表只允许本人访问；anon 无任何权限
-- ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'strategy_versions', 'beliefs', 'tasks', 'daily_logs',
    'push_subscriptions', 'notifications', 'ai_suggestions', 'ai_usage', 'alert_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner_all', t
    );
  end loop;
end;
$$;

-- 计量表不允许改写历史用量（删除仍允许，用于删除本人全部资料）。
revoke update on public.ai_usage from authenticated;

-- 删除本人全部资料（不删除登录账户本身）
create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.ai_suggestions where user_id = v_uid;
  delete from public.ai_usage where user_id = v_uid;
  delete from public.alert_feedback where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.daily_logs where user_id = v_uid;
  delete from public.tasks where user_id = v_uid;
  delete from public.beliefs where user_id = v_uid;
  delete from public.strategy_versions where user_id = v_uid;
  delete from public.profiles where user_id = v_uid;
end;
$$;

revoke execute on function public.save_strategy_version(jsonb, text, text, text, text, integer) from anon, public;
revoke execute on function public.delete_my_data() from anon, public;
grant execute on function public.save_strategy_version(jsonb, text, text, text, text, integer) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
