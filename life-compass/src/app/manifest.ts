import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "人生校准器 Life Compass",
    short_name: "人生校准器",
    description: "每天两件关键事，记录真实结果，按证据调整。",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#2f5d50",
    lang: "zh-CN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
