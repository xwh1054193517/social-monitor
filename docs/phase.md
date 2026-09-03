# Codex 分阶段开发任务

# 总原则

不要一次性实现整个 Social Monitor。

严格按照：

```text
Phase 1
↓
验证
↓
Phase 2
↓
验证
↓
Phase 3
↓
验证
...
```

每个 Phase 完成后必须：

```bash
pnpm lint
pnpm test
pnpm build
```

如果失败，先修复当前 Phase，不进入下一阶段。

---

# Phase 1 - Monorepo 基础设施

## 目标

建立：

```text
Next.js
NestJS
pnpm workspace
ESLint
Prettier
TypeScript
Docker
```

目录：

```text
social-monitor/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── types/
│   ├── shared/
│   └── config/
├── prisma/
├── docs/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── docker-compose.yml
```

---

## Task 1.1

创建 pnpm workspace。

验收：

```bash
pnpm install
```

成功。

---

## Task 1.2

创建 Next.js。

要求：

```text
TypeScript
App Router
TailwindCSS
```

---

## Task 1.3

创建 NestJS。

要求：

```text
TypeScript
ConfigModule
ValidationPipe
```

---

## Task 1.4

配置 Docker：

```text
PostgreSQL
Redis
```

---

## Task 1.5

创建：

```text
GET /health
```

---

## 验收

```bash
pnpm lint
pnpm test
pnpm build
```

并确认：

```text
PostgreSQL 可连接
Redis 可连接
API 可以启动
Web 可以启动
```

---

# Phase 2 - Prisma 数据库

## 目标

实现完整 Prisma Schema。

---

## Task 2.1

创建：

```text
prisma/schema.prisma
```

使用 docs/database.md 中的 Schema。

---

## Task 2.2

执行：

```bash
pnpm prisma generate
```

---

## Task 2.3

执行：

```bash
pnpm prisma migrate dev --name init
```

---

## Task 2.4

实现：

```text
PrismaModule
PrismaService
```

---

## 验收

可以通过 NestJS：

```text
SELECT 1
```

确认数据库连接。

---

# Phase 3 - Monitor CRUD

## 目标

实现监控对象 CRUD。

---

## Task 3.1

创建：

```text
MonitorModule
MonitorController
MonitorService
MonitorRepository
```

---

## Task 3.2

实现 DTO：

```text
CreateMonitorDto
UpdateMonitorDto
MonitorQueryDto
```

---

## Task 3.3

实现：

```http
GET /api/monitors
POST /api/monitors
GET /api/monitors/:id
PATCH /api/monitors/:id
DELETE /api/monitors/:id
```

---

## Task 3.4

实现：

```http
POST /api/monitors/:id/enable
POST /api/monitors/:id/disable
```

---

## Task 3.5

实现：

```http
POST /api/monitors/:id/check
```

第一阶段可以只实现基本参数检查。

---

## 验收

能够：

```text
创建 X Monitor
创建 TG Channel
创建 TG Group
查询
修改
删除
启用
禁用
```

---

# Phase 4 - Message Domain

## 目标

建立统一消息模型。

---

## Task 4.1

创建：

```text
NormalizedMessage
```

放入：

```text
packages/types
```

---

## Task 4.2

创建：

```text
MessageModule
MessageService
MessageController
```

---

## Task 4.3

实现：

```text
MessageService.create()
```

必须支持：

```text
source + externalId
```

幂等。

---

## Task 4.4

实现：

```http
GET /api/messages
GET /api/messages/:id
GET /api/messages/:id/notifications
```

---

## Task 4.5

实现：

```text
分页
source 筛选
target 筛选
keyword 搜索
时间范围
```

---

## 验收

手动创建一条：

```text
TELEGRAM
```

消息。

然后：

```text
GET /api/messages
```

可以查询。

重复插入相同：

```text
source
externalId
```

不能产生重复数据。

---

# Phase 5 - Direct Notification Routing

## 目标

消息保存后直接面向所有启用的通知渠道创建 NotificationTask。

---

## Task 5.1

查询启用的 NotificationChannel。

---

## Task 5.2

为每个启用渠道创建 NotificationTask。

---

## Task 5.3

确保 NotificationTask 使用：

```text
messageId
channelId
```

幂等创建。

---

## Task 5.4

如果没有启用渠道，不创建通知任务。

---

## 验收

消息保存成功后，系统为所有启用的通知渠道创建 NotificationTask。

---

# Phase 6 - Notification Domain

## 目标

建立通知系统抽象。

---

## Task 6.1

创建：

```text
NotificationChannel
NotificationTask
```

---

## Task 6.2

定义：

```ts
NotificationProvider
```

---

## Task 6.3

实现：

```text
NotificationProviderFactory
```

---

## Task 6.4

创建：

```text
TelegramNotificationProvider
WeChatNotificationProvider
```

第一阶段可以先使用 Mock Provider。

---

## Task 6.5

实现：

```http
GET /api/notifications/channels
POST /api/notifications/channels
PATCH /api/notifications/channels/:id
DELETE /api/notifications/channels/:id
POST /api/notifications/channels/:id/test
```

---

## 验收

使用 Mock：

```text
Message
 ↓
NotificationTask
 ↓
Provider
```

完整跑通。

---

# Phase 7 - Redis + BullMQ

## 目标

把通知改成真正异步任务。

---

## Task 7.1

配置：

```text
BullMQ
Redis
```

---

## Task 7.2

创建：

```text
notification-telegram
notification-wechat
```

---

## Task 7.3

NotificationTask 创建后：

```text
PENDING
 ↓
Queue
```

---

## Task 7.4

Worker：

```text
Queue
 ↓
load NotificationTask
 ↓
load Message
 ↓
load Channel
 ↓
Provider
 ↓
update status
```

---

## Task 7.5

加入：

```text
attempts = 5
```

和：

```text
exponential backoff
```

---

## Task 7.6

实现：

```text
PENDING
PROCESSING
SENT
FAILED
```

状态转换。

---

## 验收

模拟 Provider：

```text
第一次失败
第二次失败
第三次成功
```

最终：

```text
SENT
attempts = 3
```

---

# Phase 8 - Telegram

## 目标

接入 GramJS。

---

## Task 8.1

安装：

```text
telegram
```

---

## Task 8.2

实现：

```text
TelegramAccount
TelegramAuthService
```

---

## Task 8.3

实现：

```text
POST /api/telegram/login/start
POST /api/telegram/login/code
POST /api/telegram/login/password
```

---

## Task 8.4

实现：

```text
EncryptionService
```

使用：

```text
AES-256-GCM
```

---

## Task 8.5

实现：

```text
TelegramClientManager
```

要求：

```text
一个 Account
=
一个 Client
```

---

## Task 8.6

实现：

```text
GET /api/telegram/status
GET /api/telegram/dialogs
GET /api/telegram/channels
GET /api/telegram/groups
POST /api/telegram/reconnect
```

---

## Task 8.7

实现：

```text
TelegramListener
```

监听：

```text
NewMessage
```

---

## Task 8.8

监听到消息后：

```text
chatId
 ↓
MonitorTarget
 ↓
NormalizedMessage
 ↓
MessageService
```

---

## Task 8.9

Telegram externalId：

```ts
`${chatId}:${message.id}`
```

---

## Task 8.10

媒体处理：

绝对禁止：

```text
downloadMedia
downloadFile
```

只读取：

```text
message.message
```

---

## 验收

真实 Telegram Channel：

```text
发送文字
 ↓
GramJS
 ↓
Message
 ↓
PostgreSQL
```

发送：

```text
图片
```

不下载。

发送：

```text
视频
```

不下载。

---

# Phase 9 - Telegram Bot

## 目标

实现真实 Telegram Bot 通知。

---

## Task 9.1

实现：

```text
TelegramNotificationProvider
```

---

## Task 9.2

调用 Telegram Bot API：

```text
sendMessage
```

---

## Task 9.3

通知模板：

```text
[Telegram]

{targetName}

{author}

{content}

原文：
{url}
```

---

## Task 9.4

处理超长消息。

---

## 验收

完整：

```text
Telegram Channel
 ↓
GramJS
 ↓
PostgreSQL
 ↓
NotificationTask
 ↓
BullMQ
 ↓
Telegram Bot
```

---

# Phase 10 - X

## 目标

接入 X API v2。

---

## Task 10.1

实现：

```text
TwitterClient
TwitterCollector
TwitterMapper
```

---

## Task 10.2

实现：

```text
resolveUser()
```

输入：

```text
OpenAI
```

获取：

```text
userId
```

---

## Task 10.3

实现：

```text
fetchLatestPosts()
```

---

## Task 10.4

实现：

```text
Twitter Worker
```

---

## Task 10.5

实现：

```text
Twitter Poll Scheduler
```

Scheduler：

```text
每分钟
 ↓
查询 enabled X targets
 ↓
创建 polling job
```

---

## Task 10.6

使用：

```text
MonitorTarget.lastCursor
```

---

## Task 10.7

实现：

```text
X Dedupe
```

使用：

```text
source + externalId
```

---

## Task 10.8

X 消息只保存：

```text
Tweet ID
author
text
publishedAt
url
```

不保存：

```text
image
video
media
```

---

## 验收

监控：

```text
@OpenAI
```

产生新 Tweet 后：

```text
X API
 ↓
Twitter Worker
 ↓
Normalize
 ↓
PostgreSQL
 ↓
BullMQ
 ↓
Telegram Bot
```

---

# Phase 11 - WeChat

## 目标

接入企业微信 Webhook。

---

## Task 11.1

实现：

```text
WeChatNotificationProvider
```

---

## Task 11.2

发送：

```text
msgtype = text
```

---

## Task 11.3

模板：

```text
[X]

OpenAI

消息内容

原文：
https://x.com/...
```

---

## Task 11.4

Webhook URL 加密保存。

---

## 验收

执行：

```http
POST /api/notifications/channels/:id/test
```

企业微信收到测试消息。

---

# Phase 12 - Dashboard

## 目标

实现后台首页。

---

## 页面

```text
/dashboard
```

---

## Cards

```text
今日消息
X 消息
Telegram 消息
监控对象
通知成功
通知失败
```

---

## API

```http
GET /api/dashboard/overview
```

---

# Phase 13 - Monitor Admin

## 页面

```text
/monitors
```

实现：

```text
列表
新增
编辑
删除
启用
禁用
检查
```

---

## 新增流程

X：

```text
选择 X
 ↓
输入 username
 ↓
Check
 ↓
获取 user
 ↓
保存
```

Telegram：

```text
选择 Telegram
 ↓
选择 Channel / Group
 ↓
保存
```

---

# Phase 14 - Messages Admin

## 页面

```text
/messages
```

---

## 功能

```text
分页
搜索
来源筛选
目标筛选
时间筛选
```

---

## Detail

```text
/messages/:id
```

显示：

```text
Source
Target
Author
Content
Published At
Original URL
Notification Status
```

---

## Media

绝对不要显示：

```text
图片预览
视频预览
媒体播放器
```

只显示：

```text
查看原文
```

---

# Phase 15 - Notification Admin

## 页面

```text
/notifications
```

展示：

```text
Channel
Message
Status
Attempts
Error
SentAt
```

---

# Phase 16 - Settings

## 页面

```text
/settings
```

实现：

```text
X API
Telegram Account
Telegram Bot
Enterprise WeChat
```

---

# Phase 17 - SSE

## 目标

后台实时刷新。

---

## API

```http
GET /api/events
```

---

## Events

```text
message.created
notification.sent
notification.failed
monitor.status_changed
```

---

# Phase 18 - Observability

## 目标

增加基础运行监控。

---

## 日志

```text
collector.started
collector.stopped
telegram.connected
telegram.disconnected
message.received
message.saved
message.duplicate
notification.created
notification.sent
notification.failed
notification.retry
```

---

## Health

```http
GET /health
```

检查：

```text
PostgreSQL
Redis
Telegram
X
Telegram Bot
WeChat
```

---

# Phase 19 - Tests

## Unit

必须覆盖：

```text
TwitterMapper
TelegramMapper
MessageService
NotificationService
EncryptionService
```

---

## Integration

覆盖：

```text
Prisma
PostgreSQL
Redis
BullMQ
```

---

## E2E

至少一个完整流程：

```text
Create Monitor
 ↓
Create Message
 ↓
Create NotificationTask
 ↓
Queue
 ↓
Provider
 ↓
SENT
```

---

# Phase 20 - Final Acceptance

最终必须通过三个核心场景。

---

## Scenario 1 - Telegram

```text
Telegram Channel
       ↓
GramJS
       ↓
NewMessage
       ↓
MonitorTarget
       ↓
Normalize
       ↓
Message
       ↓
NotificationTask
       ↓
BullMQ
       ↓
Telegram Bot
       ↓
WeChat
```

---

## Scenario 2 - X

```text
X User
       ↓
Scheduler
       ↓
BullMQ
       ↓
Twitter Worker
       ↓
X API
       ↓
Normalize
       ↓
Message
       ↓
NotificationTask
       ↓
BullMQ
       ↓
Telegram Bot
       ↓
WeChat
```

---

## Scenario 3 - Admin

```text
/dashboard
       ↓
查看统计

/monitors
       ↓
增删改监控

/messages
       ↓
搜索消息

/messages/:id
       ↓
查看详情

/notifications
       ↓
查看通知状态

/settings
       ↓
配置平台
```

---

# Final Architecture

完成所有 Phase 后：

```text
                         ┌──────────────┐
                         │   Next.js    │
                         │    Admin     │
                         └──────┬───────┘
                                │
                                ↓
                         ┌──────────────┐
                         │    NestJS    │
                         │     API      │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ↓                 ↓                 ↓
         PostgreSQL           Redis          External APIs
                                                  │
                             ┌────────────────────┼──────────────┐
                             ↓                    ↓              ↓
                        X Collector          TG Collector     Providers
                             │                    │              │
                          X API v2             GramJS           │
                             │                    │              │
                             └─────────┬──────────┘              │
                                       ↓                         │
                                NormalizedMessage               │
                                       ↓                         │
                                  PostgreSQL                     │
                                       ↓                         │
                                NotificationTask                │
                                       ↓                         │
                                    BullMQ                       │
                                       ↓                         │
                               ┌───────┴────────┐                │
                               ↓                ↓                │
                         Telegram Bot        WeChat ←────────────┘
```

---

# 最终硬性约束

```text
TypeScript Only

NestJS Backend

Next.js Frontend

PostgreSQL

Prisma

Redis

BullMQ

X API v2

GramJS

Telegram Bot

Enterprise WeChat

No Python

No Kafka

No Microservices

No Kubernetes

No Object Storage

No Image Download

No Video Download

No Media Storage

No Complex RBAC

No AI in MVP
```

---

# MVP 最核心链路

```text
采集
 ↓
标准化
 ↓
去重
 ↓
保存
 ↓
任务
 ↓
队列
 ↓
通知
```

任何新增平台都应该只需要实现：

```text
Collector
+
Mapper
```

任何新增通知渠道都应该只需要实现：

```text
NotificationProvider
```

核心业务不应该被修改。
