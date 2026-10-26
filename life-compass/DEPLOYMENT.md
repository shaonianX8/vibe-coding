# 部署步骤

目标：让应用跑在云端，iPhone 可以从主屏幕打开，每天定时提醒不依赖电脑开机。

全程只用免费套餐：Supabase（数据库与登录）、Vercel（网站托管）。AI 是可选项，按用量付费，不配置也能正常使用。

整体结构可以想成三件东西：Supabase 是保险柜（存数据、管登录），Vercel 是前台（你在手机上看到的页面），Supabase 里的定时任务是闹钟（每 10 分钟敲一次前台的门，问要不要提醒你）。

预计用时：第一次 40 到 60 分钟。建议在电脑上操作，最后一步再用 iPhone。

---

## 第 0 步：开始前

1. **把仓库改成私有（强烈建议）。** 这个仓库现在是公开的。代码里没有任何密钥和个人背景，但它是你的个人系统，没有理由公开。GitHub 仓库页面 → Settings → 最下方 Danger Zone → Change repository visibility → Private。Vercel 免费套餐支持私有仓库。
2. **把代码合并到 main 分支。** 当前代码在 `claude/life-compass-app-bcicwr` 分支。合并到 main 后，Vercel 会把 main 当作正式版本。如果暂时不想合并，也可以在第 4 步把 Vercel 的 Production Branch 设成这个分支。
3. 准备好：一个常用邮箱、一个强密码（建议用 iPhone 钥匙串保存）、iOS 16.4 或更高版本的 iPhone。

## 第 1 步：创建 Supabase 项目

1. 打开 https://supabase.com ，用 GitHub 账号登录。
2. New project：
   - Name：`life-compass`
   - Database Password：点 Generate 生成并保存好（以后一般用不到，但要留存）
   - Region：选 **Southeast Asia (Singapore)**，离你和 Vercel 的服务器都比较近
3. 等待一两分钟项目创建完成。
4. 进入 Project Settings → API Keys（界面名称可能略有变化），记下三样东西：
   - Project URL，形如 `https://abcdxyz.supabase.co`
   - Publishable key，形如 `sb_publishable_...`
   - Secret key，形如 `sb_secret_...`（这把钥匙能绕过所有权限，只填进 Vercel，不要发给任何人）

## 第 2 步：建表

1. Supabase 左侧 SQL Editor → New query。
2. 打开仓库里的 `life-compass/supabase/migrations/20261026000000_init.sql`，全选复制，粘贴进去，点 Run。
3. 看到 Success 即可。左侧 Table Editor 里应该出现 tasks、profiles 等表，每张表都显示已开启 RLS（行级安全）。

## 第 3 步：创建你的账户，并关闭注册

1. Authentication → Users → Add user → Create new user。
   - 填你的邮箱和强密码
   - 勾选 Auto Confirm User
2. Authentication → Sign In / Providers（或 Settings）→ 关闭 Allow new users to sign up。

这样做之后，世界上只有你这一个账户能登录。应用还有第二道门：只有写进 `ALLOWED_EMAILS` 的邮箱才能进入。

## 第 4 步：部署到 Vercel

1. 打开 https://vercel.com ，用 GitHub 登录，Add New → Project → 选择 `vibe-coding` 仓库 → Import。
2. **Root Directory 选 `life-compass`**（很重要，否则会找不到项目）。
3. 展开 Environment Variables，逐个添加：

| 名称 | 值 |
| --- | --- |
| `SUPABASE_URL` | 第 1 步的 Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | 第 1 步的 Publishable key |
| `SUPABASE_SECRET_KEY` | 第 1 步的 Secret key |
| `ALLOWED_EMAILS` | 你的登录邮箱（多个用英文逗号分隔） |
| `VAPID_SUBJECT` | `mailto:你的邮箱` |

4. 点 Deploy，等待构建完成，得到一个地址，形如 `https://life-compass-xxx.vercel.app`。
5. 建议：Project → Settings → Functions → Function Region 选 Singapore（sin1），让服务器和数据库在同一地区，页面更快。

## 第 5 步：用部署助手生成推送密钥和定时任务

推送提醒需要两组密钥。为了不在任何聊天或终端里出现密钥，应用自带一个部署助手，密钥在你自己的浏览器里生成。

1. 在电脑浏览器打开你的应用地址，用第 3 步的账户登录。
2. 进入 方向 → 页面底部「部署助手」→ 点「生成」。
3. 把显示的三行（`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`CRON_SECRET`）逐个添加到 Vercel → Settings → Environment Variables。
4. Vercel → Deployments → 最新一次部署右侧菜单 → Redeploy，让新变量生效。
5. 回到部署助手页面（不要关闭标签页，否则会生成另一套值），复制第二步的整段 SQL，到 Supabase SQL Editor 运行一次。
6. 检查定时任务是否打通：等 10 分钟左右，在 Supabase SQL Editor 运行

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```

看到 `status_code` 为 200、`content` 里有 `"ok":true` 就成功了。401 表示 Vercel 里的 `CRON_SECRET` 和 SQL 里的不一致，或者还没 Redeploy。

## 第 6 步：iPhone 安装与真实推送测试

1. **先不开 VPN**，用 iPhone 的 Safari 打开应用地址，确认能打开（见下方国内网络说明）。
2. 登录后，点 Safari 底部的分享按钮 → 添加到主屏幕。
3. **从主屏幕图标打开应用**（iPhone 只允许主屏幕上的网页应用接收推送）。如果需要，再登录一次。
4. 方向 → 这台设备的通知 → 在这台设备开启通知 → 允许。
5. 点「发送测试推送」，锁屏手机，应在几秒内看到一条「测试推送」。点开它，应用会记录这条通知已被打开。
6. 第二天上午 10 点（可以在方向页修改时间），如果当天还没确认计划，会收到一条提醒。锁屏上只显示「今天的两件事还没确认」，不会出现任务内容、金额、健康或关系信息。

真实推送只能在真机上验证，这一步无法由自动测试替代。请把测试结果告诉开发者（或下一次的 Claude 会话）。

## 第 7 步（可选）：开启 AI 细化建议

1. 在 https://console.anthropic.com 创建 API Key，并在账户里设置每月消费上限。
2. Vercel 环境变量添加 `ANTHROPIC_API_KEY`。可选：`AI_MODEL`（默认 `claude-opus-5-5`）、`AI_DAILY_LIMIT`（默认 20，即 24 小时最多调用 20 次）。
3. Redeploy。之后在记录结果后的「下一步」卡片里会出现「让 AI 细化这条建议」。

不配置 AI 时：保存记录、显示任务、规则建议、提醒、统计、导出全部照常工作。

---

## 国内网络说明（需要你实测）

Vercel 默认分配的 `*.vercel.app` 域名在中国大陆经常无法直接访问。这是本方案目前最大的不确定性。应用的设计已经尽量降低影响：手机只和你的应用地址通信，从不直接连接 Supabase 或 AI 服务。

如果不开 VPN 打不开，有三个选择，按推荐顺序：

1. **绑定一个自己的域名**（每年几十元）：Vercel → Settings → Domains 添加，按提示在域名服务商处添加解析记录。很多情况下自定义域名可以直接访问，但不能保证。
2. 使用 VPN 打开（每天用一分钟，可以接受，但多一道启动成本）。
3. 以后迁移到需要备案的国内云服务。代码不依赖 Vercel 的专有功能，可以迁移，但备案流程较长，不建议现在做。

推送通知走的是苹果自己的推送服务，在国内可以正常送达，不受这个问题影响。

## 以后如何更新

- 代码合并到 main 后，Vercel 会自动重新部署。
- 以后新增的数据库迁移文件（`supabase/migrations/` 下按日期排序），按顺序在 SQL Editor 运行即可。
- 环境变量修改后都需要 Redeploy。

## 备份

Supabase 免费套餐的备份能力有限。建议每月在 方向 → 导出我的全部数据，把 JSON 文件存到你自己的网盘。导出文件包含全部任务、记录、战略版本和假设。

Supabase 免费项目如果一周没有任何访问会被暂停。定时任务每 10 分钟访问一次数据库，正常情况下不会暂停。

## 现有 ChatGPT 提醒

新应用通过两周真实使用之前，**保留现有的 ChatGPT 提醒**，本应用不会读取、修改或取消它们。两周后如果确认新提醒稳定，再由你决定关闭哪些旧提醒，关闭前先对照时间，避免同一件事收到两条提醒。

## 常见问题

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 打开页面提示服务器错误 | 环境变量缺失或填错 | 检查第 4 步的五个变量，改完 Redeploy |
| 登录提示邮箱或密码不正确 | 邮箱不在 `ALLOWED_EMAILS`，或密码错误 | 核对变量；密码可在 Supabase Users 里重置 |
| 方向页显示推送密钥未配置 | 第 5 步变量未添加或未 Redeploy | 添加后 Redeploy |
| iPhone 上没有开启通知按钮 | 不是从主屏幕图标打开的 | 先添加到主屏幕，再从图标打开 |
| 测试推送显示已接收但手机没收到 | iPhone 设置里关闭了通知或开了专注模式 | 设置 → 通知 → 人生校准器 |
| 定时任务返回 401 | `CRON_SECRET` 不一致 | 在 Supabase Vault 删除旧密钥，用部署助手重新生成并同步 |
