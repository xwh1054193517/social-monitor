# Social Monitor

一个自托管的社交平台消息监控与转发系统。持续监听指定 Telegram 频道/群组（X 平台预留）的新消息，自动去重入库，并实时转发到你的 Telegram Bot、企业微信群机器人或 QQ 官方机器人。

- **监控源**：Telegram 频道 / 群组（通过 GramJS 客户端）
- **通知渠道**：Telegram Bot、企业微信 Webhook、QQ 官方机器人
- **实时看板**：SSE 实时推送新消息与通知状态

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [整体架构](#整体架构)
- [核心实现](#核心实现)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [测试与质量](#测试与质量)
- [部署](#部署)
- [文档](#文档)

---

## 功能特性

- **Telegram 消息监控**：手机号登录 Telegram 账号，选择要监听的频道/群组，自动抓取新消息。
- **消息去重**：按 `(source, externalId)` 唯一约束去重，同一消息不会重复入库、重复通知。
- **多渠道通知转发**：一条消息可同时转发到多个启用的通知渠道，格式统一为 `【渠道】/【对象】/【发言人】/正文/原文链接`。
- **通知任务跟踪**：每条通知对应一条任务记录，状态机 `PENDING → PROCESSING → SENT/FAILED`，失败自动重试（5 次指数退避）。
- **QQ 官方机器人**：常驻 WebSocket 网关，自动捕获群 `group_openid`，支持主动推送消息到 QQ 群。
- **凭证加密**：Telegram 会话与通知渠道凭据使用 AES-256-GCM 加密存储。
- **实时看板**：SSE 推送 `message.created` / `notification.sent` / `notification.failed` 等事件。
- **单账号鉴权**：HMAC token 登录，敏感配置永不下发到前端。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | NestJS 11、TypeScript 5.9 |
| 前端 | Next.js 16、React 19、Tailwind CSS 4 |
| 数据层 | Prisma 6、PostgreSQL |
| 队列 | BullMQ + Redis |
| Telegram 客户端 | GramJS（`telegram` 包） |
| 状态管理 / 请求 | Zustand、TanStack Query |
| 测试 | Jest、Supertest（e2e） |
| 包管理 | pnpm 10（monorepo workspace） |
| 部署 | Docker Compose、Nginx |

---

## 整体架构

项目采用 pnpm monorepo 结构，后端与前端分离，通过 `packages/*` 共享类型与工具。

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                    │
│   dashboard · messages · monitors · notifications · settings │
└───────────────┬─────────────────────────────────────────────┘
                │  REST /api + SSE /api/events
┌───────────────▼─────────────────────────────────────────────┐
│                        apps/api (NestJS)                     │
│                                                              │
│  monitors ──► messages ──► notifications ──► queue (BullMQ)  │
│                (去重/入库)      (Provider 工厂)        │       │
│                                                              │
│  telegram (GramJS 监听)   qq (网关)   auth   crypto   events │
└───────┬──────────────┬───────────────────┬───────────────────┘
        │              │                   │
   PostgreSQL      Redis (队列)       外部平台 (Telegram / QQ / 企微)
```

### 数据流（监控 → 转发）

```
Telegram 频道/群组
      │  GramJS 监听新消息
      ▼
MessageService.create()  ── 去重（source+externalId）
      │
      ▼
routeToEnabledChannels()  ── 为每个启用的通知渠道创建 NotificationTask(PENDING)
      │
      ▼
NotificationQueueService.enqueueTask()  ── 按渠道类型路由到独立 BullMQ 队列
      │
      ▼
NotificationWorkerService 消费  ── 5 次重试、指数退避
      │
      ▼
NotificationProvider.send()  ── 格式化 + 调用平台 API
      │
      ▼
任务状态 SENT / FAILED，SSE 推送到前端
```

### 数据模型

| 模型 | 说明 |
| --- | --- |
| `MonitorTarget` | 监控对象（X 用户 / TG 频道 / TG 群组） |
| `Message` | 抓取到的消息（去重键 `source+externalId`） |
| `NotificationChannel` | 通知渠道（TELEGRAM / WECHAT / QQ，`config` 存加密凭据） |
| `NotificationTask` | 通知任务（状态机 + 重试计数） |
| `TelegramAccount` | TG 账号（手机号 + 加密 session） |
| `AppSetting` | 通用键值配置 |

---

## 核心实现

### 1. 通知 Provider 模式

通知渠道通过统一接口 `NotificationProvider` 抽象，工厂 `NotificationProviderFactory` 按类型分发，新增渠道只需实现接口并注册，无需改动消息路由逻辑。

```ts
// notification-provider.interface.ts
interface NotificationProvider {
  readonly type: NotificationChannelType;
  send(config: Record<string, unknown>, payload: NotificationPayload): Promise<void>;
}
```

- `telegram.provider.ts` — 通过 Bot API 发送
- `wechat.provider.ts` — 企业微信 Webhook
- `qq.provider.ts` — QQ 官方机器人主动消息

消息格式由 `message-format.ts` 的 `buildForwardText()` 统一生成：

```
【渠道标签】
【监控对象】
【发言人】（仅群组）
正文……

原文：{url}
```

### 2. BullMQ 按渠道分队列

每条通知任务入队时，根据渠道类型路由到独立队列（`notification-telegram` / `notification-wechat` / `notification-qq`），各自独立 worker 消费，互不影响、可独立扩容。任务配置 `attempts: 5` + 指数退避。

### 3. QQ 官方机器人

- **鉴权**：`POST bots.qq.com/app/getAppAccessToken` 换取 `access_token`（缓存，提前 60s 刷新）。
- **网关**：常驻 WebSocket（`wss://api.sgroup.qq.com/websocket/`），完成 Hello → 心跳 → Identify 流程；断线指数退避重连。
- **发群消息**：使用 `group_openid`（非群号），从 `GROUP_ADD_ROBOT` 事件捕获并打印到日志。
- **限频说明**：未认证群主动消息 30/qpm、每群 1000 条/天；需开启「机器人主动在群聊内发言」权限。

### 4. Telegram 客户端（GramJS）

手机号 + 验证码（支持 2FA）登录，`StringSession` 用 AES-256-GCM 加密后持久化，登录态跨重启保持。监听器将频道/群组消息归一化为 `NormalizedMessage` 交给 `MessageService`。

### 5. 加密

`crypto` 模块提供 AES-256-GCM 加密/解密，用于 Telegram session 与通知渠道凭据（`ENCRYPTION_KEY` 为 64 位 hex）。明文凭据永不落库、永不返回前端。

### 6. 认证与实时事件

- **认证**：单账号登录，HMAC 签名 token（`AUTH_SECRET`），有效期可配。
- **SSE**：`/api/events` 实时推送 `message.created`、`notification.sent/failed`、`monitor.status_changed`。

---

## 目录结构

```
social-monitor/
├── apps/
│   ├── api/                 # NestJS 后端
│   │   └── src/
│   │       ├── auth/        # 登录鉴权
│   │       ├── crypto/      # AES-256-GCM 加密
│   │       ├── dashboard/   # 概览统计
│   │       ├── events/      # SSE 实时推送
│   │       ├── health/      # 健康检查
│   │       ├── messages/    # 消息存储与通知路由
│   │       ├── monitors/    # 监控对象 CRUD
│   │       ├── notifications/ # Provider 模式 + 渠道 CRUD
│   │       ├── qq/          # QQ 官方机器人（client + 网关）
│   │       ├── queue/       # BullMQ 队列 + worker
│   │       ├── telegram/    # GramJS 客户端、登录、监听
│   │       └── main.ts
│   └── web/                 # Next.js 前端
│       └── app/             # dashboard/messages/monitors/notifications/settings/login
├── packages/
│   ├── config/              # 共享配置
│   ├── shared/              # API 响应封装等
│   └── types/               # 共享类型
├── prisma/
│   ├── schema.prisma        # 数据模型
│   └── migrations/          # 迁移
├── docs/                    # 项目文档
├── docker-compose.yml       # 本地编排
├── docker-compose.prod.yml  # 生产编排
└── deploy.sh                # 部署脚本
```

---

## 快速开始

### 前置要求

- Node.js ≥ 22、pnpm ≥ 10
- PostgreSQL、Redis

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入数据库/Redis 连接与各平台凭据
```

### 3. 初始化数据库

```bash
pnpm prisma migrate deploy   # 应用迁移
pnpm prisma generate         # 生成 Prisma 客户端
```

### 4. 启动开发环境

```bash
pnpm dev
```

- 前端：http://localhost:3000
- 后端 API：http://localhost:3001/api
- 健康检查：http://localhost:3001/health

### 5. 使用流程

1. 登录（默认 `ADMIN_USERNAME` / `ADMIN_PASSWORD`）。
2. 在「Telegram」页用手机号登录监控账号，选择要监控的频道/群组。
3. 在「监控」页添加监控对象。
4. 在「设置」页创建通知渠道（Telegram / QQ / 企业微信），点「测试」验证。
5. 监控到新消息后，会自动去重入库并转发到所有启用的通知渠道。

---

## 环境变量

完整变量清单见 [`.env.example`](.env.example)，所有值以 `xxx` 占位。关键变量：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis 连接（BullMQ） |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Telegram 客户端凭据（消息监控） |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram Bot（通知渠道） |
| `QQ_APP_ID` / `QQ_APP_SECRET` | QQ 官方机器人凭据 |
| `ENCRYPTION_KEY` | AES-256-GCM 密钥（64 hex） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 管理员登录 |
| `AUTH_SECRET` / `AUTH_TTL_SECONDS` | HMAC 签名密钥与有效期 |

> ⚠️ `.env` 与 `.env.production` 含真实凭据，已被 `.gitignore` 忽略；仅 `.env.example` 模板会纳入版本库。

---

## 测试与质量

```bash
pnpm lint     # ESLint（5 个 workspace）
pnpm test     # Jest 单元 + e2e 测试
pnpm build    # nest build + next build
```

---

## 部署

生产环境使用 Docker Compose + Nginx 反向代理：

```bash
# 在服务器上，配置 .env.production 后执行
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

详细步骤见 [`docs/`](docs/) 与 `deploy.sh`。

---

## 文档

- [`docs/Social Monitor API.md`](docs/Social%20Monitor%20API.md) — 完整 API 说明
- [`docs/database.md`](docs/database.md) — 数据库设计
- [`docs/phase.md`](docs/phase.md) — 分阶段开发规划
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 贡献指南

## License

本项目基于 [MIT License](LICENSE) 开源。
