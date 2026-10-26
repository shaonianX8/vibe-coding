// Life Compass service worker：只负责推送通知和断网提示。
// 不缓存任何包含个人数据的页面。
const OFFLINE_CACHE = "lc-offline-v1";
const OFFLINE_URLS = ["/offline", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline")) || Response.error()));
});

self.addEventListener("push", (event) => {
  let data = { title: "人生校准器", body: "打开看看今天的两件事。", url: "/today", tag: "life-compass" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // 解析失败也必须显示通知，否则 iOS 会撤销推送权限
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  const id = new URL(url, self.location.origin).searchParams.get("n");
  event.waitUntil(
    (async () => {
      if (id) {
        try {
          await fetch("/api/notifications/opened", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ id }),
          });
        } catch (e) {
          // 记录失败不影响打开应用
        }
      }
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
