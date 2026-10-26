-- 云端定时提醒：在 Supabase 的 SQL Editor 里运行一次。
-- 应用里的「方向 → 部署助手」页面会自动填好下面两个值，直接复制即可。
-- 把 APP_URL 换成你的应用地址（不要以 / 结尾），把 CRON_SECRET 换成和 Vercel 环境变量 CRON_SECRET 相同的值。

-- 1. 启用定时任务与网络请求扩展
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2. 把地址和密钥存进 Vault（加密保存，不写进任务定义）
select vault.create_secret('APP_URL', 'life_compass_url');
select vault.create_secret('CRON_SECRET', 'life_compass_cron_secret');

-- 3. 每 10 分钟调用一次 /api/cron/tick。重复调用是安全的，不会重复发送提醒。
select cron.schedule(
  'life-compass-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'life_compass_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'life_compass_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);

-- 检查：最近的调用结果（status_code 应为 200）
-- select id, status_code, content, created from net._http_response order by created desc limit 5;
-- 停用：select cron.unschedule('life-compass-tick');
