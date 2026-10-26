"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "checking" | "unsupported" | "needs_install" | "denied" | "off" | "on";

export function PushManager({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "needs_install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("save");
      setState("on");
      setMessage("已开启。可以点「发送测试推送」确认。");
    } catch {
      setMessage("开启失败。请确认已经从主屏幕图标打开应用，并且网络正常。");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("这台设备的通知已关闭。");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = (await res.json()) as { message?: string };
      setMessage(body.message ?? (res.ok ? "已发送" : "发送失败"));
    } catch {
      setMessage("网络中断，测试没有发出。");
    } finally {
      setBusy(false);
    }
  }

  if (!vapidPublicKey) return <p className="muted small">服务器还没有配置推送密钥（VAPID），通知暂不可用。应用其余功能正常。</p>;

  return (
    <div className="stack">
      {state === "checking" ? <p className="muted small">检查中…</p> : null}
      {state === "needs_install" ? (
        <p className="small">iPhone 需要先把应用添加到主屏幕：在 Safari 点分享按钮，选择「添加到主屏幕」，然后从主屏幕图标打开，再回到这里开启通知。</p>
      ) : null}
      {state === "unsupported" ? <p className="muted small">这个浏览器不支持网页推送。应用其余功能正常。</p> : null}
      {state === "denied" ? <p className="small">通知权限被拒绝了。可以在 iPhone 设置 → 通知 → 人生校准器 里重新打开。应用其余功能不受影响。</p> : null}
      {state === "off" ? (
        <button className="primary" type="button" onClick={enable} disabled={busy}>
          在这台设备开启通知
        </button>
      ) : null}
      {state === "on" ? (
        <div className="row">
          <button type="button" onClick={test} disabled={busy}>
            发送测试推送
          </button>
          <button type="button" onClick={disable} disabled={busy}>
            关闭这台设备的通知
          </button>
        </div>
      ) : null}
      {message ? <p className="notice">{message}</p> : null}
    </div>
  );
}
