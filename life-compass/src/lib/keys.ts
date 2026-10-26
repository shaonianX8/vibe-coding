// 在浏览器（或 Node）里用 WebCrypto 生成部署所需的密钥，不经过服务器。

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 生成 Web Push 使用的 VAPID 密钥对（P-256），格式与 web-push 库一致 */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("密钥导出失败");
  return { publicKey: b64url(pub), privateKey: jwk.d };
}

export function generateSecret(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
