// 生成 Web Push 需要的 VAPID 密钥对。把输出填进部署平台的环境变量，不要提交到仓库。
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
