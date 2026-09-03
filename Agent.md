# AGENTS.md

## Project: Social Monitor

这是一个基于 TypeScript 的 X / Telegram 消息监控与通知系统。

项目目标：

- 监控 X 用户
- 监控 Telegram Channel
- 监控 Telegram Group
- 保存文本消息
- 通过 Telegram Bot / 企业微信发送通知
- 提供简单 Web Admin
- 支持后续扩展更多平台和通知渠道

---

# 1. Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- TanStack Query
- Zustand
- React Hook Form
- Zod

## Backend

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Pino

## External Services

### X

- X API v2

### Telegram

- GramJS
- Telegram MTProto

### Notification

- Telegram Bot API
- Enterprise WeChat Webhook

---

# 2. Architecture

整体架构：

```text
X API ─────────────┐
                  │
                  ↓
Telegram/GramJS → Collector
                  │
                  ↓
             Normalize
                  │
                  ↓
             Deduplicate
                  │
                  ↓
             PostgreSQL
                  │
                  ↓
         NotificationTask
                  │
                  ↓
               BullMQ
                  │
          ┌───────┴───────┐
          ↓               ↓
   Telegram Bot       WeChat
```

核心原则：

```text
Collector
    ↓
NormalizedMessage
    ↓
MessageService
    ↓
NotificationService
    ↓
NotificationProvider
```

---

# 3. Critical Architecture Rules

## 3.1 全项目使用 TypeScript

禁止引入 Python 作为核心运行时。

AI / 数据处理 / API / Worker 全部使用 TypeScript。

---

## 3.2 Controller 不允许直接调用第三方 API

错误：

```ts
@Controller()
export class MonitorController {
  @Get()
  async test() {
    return axios.get('https://api.twitter.com');
  }
}
```

正确：

```text
Controller
    ↓
Service
    ↓
Collector / Provider
    ↓
External API
```

---

# 4. External SDK Isolation

第三方 SDK 必须隔离。

## X

只允许出现在：

```text
modules/twitter/
```

## Telegram

只允许出现在：

```text
modules/telegram/
```

## Notification

第三方发送 SDK / HTTP 请求只允许出现在：

```text
modules/notifications/providers/
```

业务代码不能直接 import GramJS / X SDK。

---

# 5. Collector Architecture

所有采集器都必须最终转换成：

```ts
NormalizedMessage
```

接口：

```ts
export interface Collector {
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

消息采集：

```ts
export interface MessageCollector {
  collect(
    target: MonitorTarget,
  ): Promise<NormalizedMessage[]>;
}
```

---

# 6. NormalizedMessage

统一消息结构：

```ts
export interface NormalizedMessage {
  source: 'X' | 'TELEGRAM';

  externalId: string;

  targetExternalId: string;

  targetType:
    | 'X_USER'
    | 'TG_CHANNEL'
    | 'TG_GROUP';

  targetName: string;

  author?: {
    externalId?: string;
    username?: string;
    displayName?: string;
  };

  content: string;

  url?: string;

  publishedAt: Date;
}
```

---

# 7. Media Policy

这是项目的硬性规则。

## 禁止保存图片

系统不得：

- 下载图片
- 保存图片
- 上传图片到 OSS
- 保存图片 Base64
- 保存图片二进制
- 保存图片对象

## 禁止保存视频

系统不得：

- 下载视频
- 保存视频
- 上传视频
- 视频转码
- 保存视频文件

## 不引入对象存储

MVP 不使用：

- S3
- OSS
- MinIO
- R2

---

# 8. Message Storage

Message 只保存：

```text
source
externalId
targetId
author
content
url
publishedAt
```

不要增加：

```text
media
images
videos
files
attachments
objectStorageKey
```

---

# 9. Telegram Media Handling

Telegram 消息中如果包含：

```text
photo
video
document
gif
```

不要执行：

```ts
downloadMedia()
```

不要执行：

```ts
downloadFile()
```

如果消息有文字：

```text
保存文字
+
原文链接
```

如果只有图片 / 视频，没有文字：

```text
忽略
```

---

# 10. Telegram Architecture

Telegram 使用一个 User Account。

不要：

```text
一个监控目标
=
一个 Telegram Client
```

必须：

```text
TelegramAccount
       ↓
TelegramClient
       ↓
多个 MonitorTarget
```

一个 Telegram Client 监听所有需要监控的 Channel / Group。

---

# 11. Telegram Session Security

Telegram StringSession 属于敏感凭证。

必须：

```text
AES-256-GCM
```

加密后保存。

禁止：

```text
console.log(session)
logger.info(session)
```

禁止返回给前端。

---

# 12. X Polling

X 使用 Scheduler + BullMQ。

禁止：

```ts
while (true) {
  poll();
}
```

正确：

```text
Scheduler
    ↓
查询 enabled X targets
    ↓
创建 BullMQ Job
    ↓
Twitter Worker
```

必须防止同一个 target 同时存在多个 polling job。

---

# 13. Queue Rules

Queue 使用：

```text
Redis + BullMQ
```

Job 只传 ID。

错误：

```ts
queue.add('notification', {
  message: completeMessage,
});
```

正确：

```ts
queue.add('notification', {
  notificationTaskId,
});
```

数据库 PostgreSQL 是 Source of Truth。

---

# 14. Idempotency

Message：

```prisma
@@unique([source, externalId])
```

NotificationTask：

```prisma
@@unique([messageId, channelId])
```

任何情况下都必须防止：

```text
重复消息
重复通知
```

---

# 15. Notification Architecture

统一接口：

```ts
export interface NotificationProvider {
  send(
    message: NotificationMessage,
  ): Promise<NotificationResult>;

  healthCheck(): Promise<boolean>;
}
```

实现：

```text
TelegramNotificationProvider
WeChatNotificationProvider
```

以后增加：

```text
Discord
Slack
Email
```

不能修改核心 MessageService。

---

# 16. Direct Notification Routing

MVP 不做内容过滤。消息保存成功后，系统为所有启用的通知渠道创建通知任务。

路由规则：

```text
Message
    ↓
NotificationService
    ↓
enabled NotificationChannel
    ↓
NotificationTask
```

如果没有启用渠道，不创建 NotificationTask。

---

# 17. Error Handling

外部 API 必须处理：

- Timeout
- Rate Limit
- Unauthorized
- Bad Request
- Server Error
- Network Error

可重试错误进入 Queue Retry。

不可重试错误直接记录 FAILED。

---

# 18. Retry

默认：

```text
attempts = 5
```

使用 exponential backoff：

```text
3s
6s
12s
24s
48s
```

不要无限重试。

---

# 19. Logging

使用 Pino。

日志应该结构化：

```json
{
  "event": "message.saved",
  "messageId": "xxx",
  "source": "TELEGRAM",
  "targetId": "xxx"
}
```

禁止日志记录：

```text
Telegram Session
Telegram API Hash
Telegram Bot Token
X API Secret
X Access Token Secret
WeChat Webhook
```

---

# 20. API Rules

所有 DTO 必须验证。

推荐：

```text
class-validator
```

或者：

```text
Zod
```

所有 API 必须统一返回格式。

错误：

```json
{
  "message": "xxx"
}
```

成功：

```json
{
  "data": {}
}
```

分页：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

---

# 21. Frontend Rules

前端：

```text
UI
 ↓
TanStack Query
 ↓
API Client
 ↓
NestJS
```

不要在 React Component 内直接：

```ts
fetch()
```

统一封装：

```text
lib/api/
```

---

# 22. State Management

服务端数据：

```text
TanStack Query
```

客户端 UI 状态：

```text
Zustand
```

不要把所有服务端数据复制进 Zustand。

---

# 23. Form

表单使用：

```text
React Hook Form
+
Zod
```

例如 Monitor 创建：

```text
type
name
username
enabled
```

---

# 24. Database Rules

数据库操作统一通过：

```text
PrismaService
```

Service 不直接创建 Prisma Client。

禁止：

```ts
new PrismaClient()
```

每个模块复用全局 PrismaService。

---

# 25. Transaction

涉及：

```text
Message
+
NotificationTask
```

的一致性操作时优先使用 Prisma transaction。

---

# 26. Testing

每个核心模块必须有 Unit Test。

重点：

```text
TwitterMapper
TelegramMapper
MessageService
NotificationService
EncryptionService
```

Integration Test：

```text
PostgreSQL
Redis
BullMQ
```

E2E：

```text
Monitor
→ Message
→ NotificationTask
→ Queue
→ Provider
```

---

# 27. Development Process

禁止一次性生成整个项目。

必须按照：

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
```

进行。

每个 Phase 完成后：

```bash
pnpm lint
pnpm test
pnpm build
```

必须通过。

---

# 28. MVP Non-Goals

MVP 不实现：

- Kafka
- Kubernetes
- Microservices
- Object Storage
- Complex RBAC
- Multi-tenancy
- Billing
- AI classification
- AI summarization
- Image understanding
- Video understanding

---

# 29. Coding Style

优先：

```text
small functions
explicit types
dependency injection
single responsibility
```

避免：

```text
God Service
God Controller
大量 any
全局变量
隐式依赖
```

---

# 30. Git Rules

Commit 推荐：

```text
feat:
fix:
refactor:
test:
docs:
chore:
```

例如：

```text
feat: add monitor CRUD
feat: add telegram client manager
feat: add notification queue
fix: prevent duplicated telegram messages
```

---

# 31. Definition of Done

一个功能只有满足：

```text
代码完成
+
类型检查通过
+
Lint 通过
+
Test 通过
+
Build 通过
+
核心流程可以运行
```

才算完成。
