# Life Compass 人生校准器

一个可以装在 iPhone 主屏幕上的个人决策与行为校准应用。

它每天只做一件事：帮你确认两件关键行动（一件现实责任，一件长期积累），降低开始的门槛，记录真实结果，再根据结果调整下一次的条件。它不追求任务数量和使用时长，并且会定期检查自己是否真的有用。

## 每天怎么用（约一分钟）

1. 早上打开（或点开 10 点的提醒）：两件事已经预填好，确认即可。优先继承昨天没做完的，否则来自当前季度重点。
2. 到点按「开始行动」，照着第一步做。时间不够时，做最低行动也算数。
3. 做完或没做成，都记一下结果。没开始就选一个障碍，系统会调整下一次的条件，比如缩小任务、换时间、写清第一步，而不是催你。

## 三个页面

| 页面 | 内容 |
| --- | --- |
| 今天 | 当前阶段、模式、两件关键任务、开始、记录结果、下一步建议 |
| 记录 | 规则预警、最近 7 天、每日记录、障碍、补记、工具自检 |
| 方向 | 人生终局、2036 战略、季度重点、主要限制因素、战略版本、事实与假设、设置、导出 |

## 文档

| 文件 | 内容 |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | **从零部署到 iPhone 的完整步骤**（先看这个） |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | 功能、验收结果、后续版本 |
| [LIFE_STRATEGY.md](LIFE_STRATEGY.md) | 长期战略初始资料（不含个人敏感背景） |
| [AI_RULES.md](AI_RULES.md) | AI 能做什么、不能做什么，预警与建议规则 |
| [DATA_MODEL.md](DATA_MODEL.md) | 数据结构、来源、权限 |
| [DECISIONS.md](DECISIONS.md) | 重大设计决策与代价 |
| [CHANGELOG.md](CHANGELOG.md) | 修改历史 |

## 技术结构

- Next.js 16（App Router，TypeScript），可安装网页应用（PWA）
- Supabase：PostgreSQL（全部表启用行级安全）、登录、Cron 定时任务
- Web Push 推送（VAPID）
- Anthropic API（可选，可替换）

```
life-compass/
  src/
    app/            页面与接口：today、records、direction、setup、login、api/*
    components/     界面组件
    lib/domain/     业务规则（纯函数，不依赖数据库和 AI，全部有单元测试）
    lib/ai/         AI 接口与提示词
    lib/push/       推送发送与定时调度
    lib/data/       数据库读写
  supabase/
    migrations/     数据库结构
    ops/cron.sql    云端定时任务设置
  tests/
    unit/           业务规则单元测试
    db/             数据库权限、调度、AI 集成测试（需要本地 Supabase）
    e2e/            iPhone 视口端到端测试（需要本地 Supabase）
```

## 本地开发

需要 Node.js 20 以上和 Docker。

```bash
npm install
npx supabase start          # 启动本地数据库，会打印本地的 URL 和密钥
cp .env.example .env.local  # 填入上一步打印的本地值，ALLOWED_EMAILS 填测试邮箱
npm run dev                 # http://localhost:3000
```

本地测试账户可以在 http://127.0.0.1:54323 （Supabase Studio）里创建，或运行端到端测试时自动创建。

## 测试

```bash
npm run typecheck   # 类型检查
npm test            # 单元测试（不需要数据库）
npm run test:db     # 数据库集成测试（需要 npx supabase start）
npm run build && npm run test:e2e   # 端到端测试（需要本地数据库）
```

测试只会连接本地数据库，检测到非本地地址会拒绝运行，模拟数据不会进入正式环境。

本地 `.env.local` 里设置 `AI_PROVIDER=mock` 可以用测试模型代替真实 AI，`ALLOW_TEST_CLOCK=1` 允许定时任务接口指定测试时间。**这两项不要在线上设置。**

## 当前状态

V0 已完成并通过自动化测试。还需要你完成：部署、iPhone 真机推送测试、国内网络实测、（可选）配置 AI 密钥后试用一次。详见 [PRODUCT_SPEC.md](PRODUCT_SPEC.md) 的验收表。
