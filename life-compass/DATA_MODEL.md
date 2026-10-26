# 数据结构与数据来源

迁移文件：`supabase/migrations/20261026000000_init.sql`。所有表都开启并强制行级安全（RLS），只允许登录用户读写自己的行，匿名请求没有任何权限。

## 通用约定

| 约定 | 字段 |
| --- | --- |
| 归属用户 | 每张表都有 `user_id`，RLS 以它判断归属 |
| 发生时间 | `local_date`：用户时区下的日期（默认 Asia/Shanghai） |
| 记录时间 | `created_at`、`updated_at`、`outcome_recorded_at` |
| 信息来源 | `source` 字段，取值见各表 |
| 是否经用户确认 | `confirmed_by_user`、`confirmed_at` |
| 当前是否有效 | `is_valid`、`status` |
| 适用时间范围 | `valid_from`、`valid_until`、`review_after`（过期提示待确认） |
| 证据 | `evidence` |

## 表

### profiles 用户设置
时区、每日提醒时间、提醒开关、暂停到哪天、当前模式（正常、紧急、恢复）及切换时间。模式只能由用户切换。

### strategy_versions 长期战略版本
`content`（JSON）包含：人生终局、价值原则、2036 战略、研究主题与领域、五种资本说明、必要条件、当前阶段与优先级、季度重点（两项默认任务与健康事项）、主要限制因素。

- 每次修改保存为新版本：`change_summary`（改了什么）、`change_reason`（为什么，必填）、`evidence`、`based_on_version`、`confirmed_at`。
- `status`：active（生效，每个用户只有一个）、archived、proposed、rejected。
- `source`：template（初始模板，待确认）、user、restore（恢复旧版）、ai_proposal。
- 约束 `ai_never_active`：AI 提案不能成为生效版本。
- 函数 `save_strategy_version`：在一个事务里归档旧版本、写入新版本，并用咨询锁防止并发产生两个生效版本。

### beliefs 事实、假设与约束
`kind`：fact（事实）、hypothesis（待验证假设）、constraint（现实约束）。
`source`：user_confirmed、system_observed、imported、ai_inferred。
约束 `ai_inference_is_hypothesis`：AI 推测只能是假设。标记不再成立时保留记录并写明原因（`invalidated_reason`），不物理删除。

### tasks 关键任务与执行结果
- 计划字段：`kind`（reality 现实责任、long_term 长期积累）、标题、开始时间、地点、第一步、完整目标、最低行动、截止日期、是否原创作品。
- 结果字段：`status`（planned、done、partial、not_started、cancelled、deferred）、`started_at`、`output_level`（thinking、planning、preparing、executing、delivered、result）、是否只完成最低行动、结果备注、障碍及补充、延后日期。
- 学习字段：`carried_from_task_id`（继承自哪件任务）、`adjustment`（这次用了什么调整方法）、`source`（user、carry_over、strategy_default、rule_suggestion、ai_suggestion）、`followup_decision`（对下一步建议的处理：采纳、修改后采纳、拒绝、已知悉）。
- 唯一索引：同一天同一类只有一个未取消的关键任务，重复提交天然幂等。

「哪种调整曾经有效」不需要单独的表：看带 `adjustment` 的任务最后的 `status` 即可。

### daily_logs 每日状态
模式快照、精力（1 到 3）、身体不适、首次打开时间、是否从通知打开、计划确认时间、计划耗时秒数、记录耗时秒数。后三项用于评估工具本身的负担。

### push_subscriptions 推送订阅
每台设备一条。失效（404、410）时自动写入 `disabled_at`，不再发送。导出数据时不导出加密密钥。

### notifications 通知记录
`dedupe_key` 唯一（如 `daily_plan:2026-10-26`），保证同一提醒只发一次。
`status`：pending、accepted（推送服务已接收，**不等于用户已收到**）、failed、skipped（附原因：已计划、已暂停、已关闭）。
`opened_at`：用户点开通知，这是唯一可靠的已看到信号。

### ai_suggestions、ai_usage
AI 建议原文（经过结构校验）、模型、用户决定（pending、accepted、modified、rejected）。用量表记录每次调用是否成功、错误类型和词元数，用于成本上限。

### alert_feedback
用户对预警的反馈（不准确、有帮助），用于暂停和调整同类预警。

## 事实与假设的分离

| 类型 | 存放位置 |
| --- | --- |
| 用户确认的事实 | `beliefs`（kind=fact, source=user_confirmed）；战略版本（confirmed_by_user） |
| 系统直接记录的行为 | `tasks`、`daily_logs`、`notifications` |
| 外部导入资料 | `beliefs`（source=imported，默认未确认）。V0 不提供任何自动导入 |
| AI 生成的推测 | `ai_suggestions`；写入 `beliefs` 时只能是假设 |

## 身份隔离

历史 ChatGPT 账户存在多人使用的情况。V0 **不读取、不导入**任何聊天历史。以后如果增加导入功能，必须逐条展示来源，由用户确认、排除或删除，默认标记为未确认。

## 模拟数据与正式数据隔离

自动化测试只连接本地数据库（`npx supabase start`），测试代码会检查数据库地址，不是本地地址就拒绝运行。模拟数据不可能进入正式复盘。

## 导出与删除

- 导出：`/api/export` 返回本人全部表的 JSON。
- 删除：函数 `delete_my_data()` 删除本人全部业务数据（登录账户本身保留，可在 Supabase 后台删除）。

## V0 暂未建立的实体

经济记录、作品记录、复盘报告、重大决策、数据来源与证据的独立表、专项健康计划。它们在对应版本加入，届时新增迁移文件，不修改已有迁移。
