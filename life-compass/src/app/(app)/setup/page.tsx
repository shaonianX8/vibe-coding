import { env } from "@/lib/env";
import { SetupHelper } from "@/components/SetupHelper";

export const dynamic = "force-dynamic";

// 部署助手：在你自己的浏览器里生成推送密钥和定时任务密钥，不经过服务器、不需要电脑终端。
export default function SetupPage() {
  return (
    <>
      <h1>部署助手</h1>
      <p className="muted small">这里生成的密钥只在你这台设备的浏览器里产生，不会发送到服务器，也不要粘贴到任何聊天里。</p>
      <div className="card">
        <h2>当前状态</h2>
        <ul className="dots small">
          <li>推送密钥（VAPID）：{env.vapid() ? "已配置" : "未配置"}</li>
          <li>定时任务密钥（CRON_SECRET）：{process.env.CRON_SECRET ? "已配置" : "未配置"}</li>
          <li>AI 密钥：{env.ai() ? "已配置" : "未配置（可选）"}</li>
        </ul>
      </div>
      <SetupHelper />
    </>
  );
}
