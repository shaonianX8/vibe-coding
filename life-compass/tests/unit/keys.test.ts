import { describe, expect, it } from "vitest";
import webpush from "web-push";
import { generateSecret, generateVapidKeys } from "@/lib/keys";

describe("部署助手生成的密钥", () => {
  it("VAPID 密钥能被 web-push 库直接使用并签名", async () => {
    const { publicKey, privateKey } = await generateVapidKeys();
    expect(() => webpush.setVapidDetails("mailto:test@example.com", publicKey, privateKey)).not.toThrow();
    const headers = webpush.getVapidHeaders("https://web.push.apple.com", "mailto:test@example.com", publicKey, privateKey, "aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=/);
  });

  it("定时任务密钥足够长且每次不同", () => {
    const a = generateSecret();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(generateSecret()).not.toBe(a);
  });
});
