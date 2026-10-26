// 用浏览器把 SVG 指南针图标渲染成 PNG（只需在修改图标时运行一次）。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2f5d50"/>
  <circle cx="256" cy="256" r="168" fill="none" stroke="#f6f5f1" stroke-width="22"/>
  <polygon points="256,112 292,256 256,400 220,256" fill="#f6f5f1"/>
  <polygon points="256,112 292,256 220,256" fill="#e8b85c"/>
  <circle cx="256" cy="256" r="18" fill="#2f5d50"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });
// 云端开发环境预装的浏览器版本可能与项目依赖不同，可用 PW_CHROMIUM 指定
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
for (const [size, name] of [[512, "icon-512.png"], [192, "icon-192.png"], [180, "apple-touch-icon.png"]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log("icons written");
