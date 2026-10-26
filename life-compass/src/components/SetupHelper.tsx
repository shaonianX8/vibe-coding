"use client";

import { useEffect, useState } from "react";
import { generateSecret, generateVapidKeys } from "@/lib/keys";

interface Generated {
  vapidPublic: string;
  vapidPrivate: string;
  cronSecret: string;
}

const KEY = "lc-setup-generated";

export function SetupHelper() {
  const [gen, setGen] = useState<Generated | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setGen(JSON.parse(saved) as Generated);
    } catch {
      // 忽略
    }
  }, []);

  async function generate() {
    const vapid = await generateVapidKeys();
    const g = { vapidPublic: vapid.publicKey, vapidPrivate: vapid.privateKey, cronSecret: generateSecret() };
    setGen(g);
    try {
      // 只保存在本标签页，关闭即消失，防止刷新后生成不一致的两套值
      sessionStorage.setItem(KEY, JSON.stringify(g));
    } catch {
      // 忽略
    }
  }

  const sql = gen
    ? `create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('${origin}', 'life_compass_url');
select vault.create_secret('${gen.cronSecret}', 'life_compass_cron_secret');
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
);`
    : "";

  return (
    <>
      <div className="card stack">
        <h2>第一步：生成密钥</h2>
        <button type="button" className="primary" onClick={generate}>
          {gen ? "重新生成（会作废上一套）" : "生成"}
        </button>
        {gen ? (
          <>
            <p className="small">把下面三行分别填进 Vercel → Settings → Environment Variables，然后重新部署：</p>
            <textarea readOnly rows={5} value={`VAPID_PUBLIC_KEY=${gen.vapidPublic}\nVAPID_PRIVATE_KEY=${gen.vapidPrivate}\nCRON_SECRET=${gen.cronSecret}`} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "monospace", fontSize: 13 }} />
            <p className="muted small">另外还需要 VAPID_SUBJECT=mailto:你的邮箱。</p>
          </>
        ) : null}
      </div>
      {gen ? (
        <div className="card stack">
          <h2>第二步：开启云端定时提醒</h2>
          <p className="small">复制下面整段，粘贴到 Supabase → SQL Editor 运行一次。地址已经自动填为 {origin}。</p>
          <textarea readOnly rows={12} value={sql} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "monospace", fontSize: 12 }} />
          <p className="muted small">如果以前运行过，先运行 select cron.unschedule(&apos;life-compass-tick&apos;); 并在 Vault 里删除旧的两个密钥。</p>
        </div>
      ) : null}
    </>
  );
}
