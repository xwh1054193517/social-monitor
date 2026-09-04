# Telegram 后端从 GramJS 迁移到 Python 实施方案（规划大纲）

> 背景：现有基于 GramJS（`telegram` npm 包）的 Telegram **上行**监听收不到频道/群组消息，已确认属于 GramJS 库级缺陷（频道 `pts` gap 恢复缺失、`addEventHandler` 不推 `updateNewChannelMessage`）。本规划用 Python MTProto 库替换上行路径，并尽量复用现有业务/通知逻辑。

---

## 0. 决策依据与一句话结论

- **问题只在「上行」**：用户账号登录 + 频道/群组消息捕获（GramJS）收不到消息；**下发通知不受影响**。
- **下发（通知）不动**：`apps/api/src/notifications/providers/telegram.provider.ts` 走 Telegram **Bot API**（`fetch` 到 `api.telegram.org/bot<token>/sendMessage`），与 GramJS 零耦合。
- **Python 库无法在 Node 内运行**：MTProto 用户账号客户端必须是独立 Python 进程（sidecar）。
- **结论**：引入一个 Python sidecar 进程负责「登录 + 监听」，通过**内部 HTTP 接口**把标准化消息交给现有 NestJS `MessageService` 流水线（去重/目标解析/通知路由）处理。选 **Telethon** 作为 Python 库。

---

## 1. 范围界定

### 1.1 必须改动（上行路径）
| 现有文件 | 角色 | 迁移动作 |
|---|---|---|
| `telegram/telegram-client-manager.service.ts` | 客户端注册表 + 登录流程 + 连接管理（GramJS 包装） | 改造为 **Python sidecar 的代理客户端**（HTTP 代理），公开 API 表面保持不变 |
| `telegram/telegram-auth.service.ts` | 编排登录、持久化加密 session、启动监听 | 登录请求代理到 sidecar；session 存储格式由 GramJS StringSession → Telethon StringSession（加密层不变） |
| `telegram/telegram-listener.ts` | 注册 GramJS `NewMessage` handler → `MessageService.create` | **整体外移到 Python sidecar**；NestJS 侧改为「内部 ingest 端点接收」 |
| `telegram/telegram-mapper.ts` | GramJS `Api.Message` → `NormalizedMessage` | 映射逻辑在 Python 侧等价重实现（输入从 GramJS Message 换成 Telethon Message） |
| `health/health.service.ts` | `checkTelegram()` 调 `getActiveClient()` | 改为查询 sidecar 健康状态 |

### 1.2 保持不变（或仅委托层不动）
- `telegram/telegram.controller.ts`：REST 路由（`login/start`、`login/code`、`login/password`、`status`、`dialogs`、`channels`、`groups`、`reconnect`、`logout`）**签名与路由不变**，仅内部实现改为代理。
- `telegram/telegram-account.repository.ts`、Prisma 模型 `TelegramAccount`/`MonitorTarget`/`Message`/`NotificationTask`：**结构基本不变**（仅 `session` 字段内裹载荷格式变化）。
- `messages/message.service.ts` + `message.repository.ts`：去重、目标解析、通知触发逻辑**完全复用**，通过新 ingest 端点进入。
- `notifications/**`：Bot API 下发逻辑不变。

### 1.3 架构级新增
- 新增独立 Python 服务（建议放在 `apps/telegram-worker/` 或 `services/telegram-sidecar/`），长驻进程，持有 Telegram 连接与事件监听。

---

## 2. Python 客户端库选型（Telethon vs Pyrogram）

| 维度 | **Telethon**（推荐） | Pyrogram |
|---|---|---|
| API 形态 | TL 直映射，`get_dialogs`/`add_event_handler`/`events.NewMessage`/`sign_in` 与 GramJS 命名几乎 1:1 | 现代化 Filters 风格（`MessageHandler` + `Filters`），范式差异较大 |
| 与 GramJS 翻译成本 | **最低**（方法名/概念对齐，mapper 与登录流改写量小） | 中等（需重新映射概念） |
| Session 可移植性 | `StringSession` 为已知 base64 结构，**可从 GramJS 转换**（best-effort） | 默认 SQLite 文件，`StringSession` 较少用，转换文档较少 |
| 在本项目已验证 | ✅ 已有 `scripts/tg_watch.py` 证明可收到频道消息 | 未验证 |
| 性能 / 维护 | 单维护者，速度中等 | 更活跃、更快 |
| 运行模型 | asyncio 原生 → 适合长驻监听服务 | asyncio 原生 |

**选型结论：Telethon。** 理由：与 GramJS API 对齐度最高（改写风险最小）、session 字符串可移植、本项目已实测可收消息。Pyrogram 作为备选（若后期更看重性能/活跃度），但本次不采用。

---

## 3. 目标架构

### 3.1 进程拓扑
```
┌────────────┐      REST /login/*                 ┌──────────────────────────┐
│   Web 前端  │ ───────────────────────────────▶  │   NestJS API (apps/api)  │
└────────────┘      status/dialogs/...            │  ├─ telegram.controller  │
                                                  │  ├─ TelegramClientManager│──┐ (HTTP 代理)
┌────────────┐  POST /internal/telegram/ingest   │  ├─ MessageService (复用)│  │
│ Telegram   │ ◀────── 标准化消息(JSON) ─────────│  └─ health (查 sidecar) │◀─┘
│  Servers   │                                   └──────────────────────────┘
└────────────┘        ▲
                     │ 连接 / 监听 / 登录
            ┌────────┴───────────┐
            │ Python Sidecar     │  Telethon 客户端
            │ (telegram-worker)  │  - 登录流程 + phone_code_hash
            │  - 事件监听         │  - add_event_handler(NewMessage)
            │  - 映射→Normalized │  - 健康/状态
            └────────────────────┘
```
> 通知下发（虚线外）：NestJS `TelegramNotificationProvider` 仍直接打 Bot API，**不经过 sidecar**。

### 3.2 集成模式选型（sidecar → NestJS 消息传递）
- **模式 A（推荐）：内部 HTTP ingest 端点**
  - sidecar 捕获消息 → `POST /internal/telegram/ingest`（带 `x-internal-secret` 头）→ NestJS 调 `MessageService.create(normalized)`。
  - 优势：业务/去重/通知逻辑**全部留在 NestJS**，Python 侧极薄（连 + 听 + 转发），改动面最小。
- 模式 B：sidecar 直写 Postgres `Message` 表。❌ 绕过去重/业务逻辑，需 DB 凭据，schema 耦合，不推荐。
- 模式 C：经 BullMQ/Redis 队列（项目已有 Redis）。可选异步解耦，但增加复杂度；若需要削峰可后续引入。

**推荐模式 A。** 监听侧把**所有** `NewMessage` 原样转发，由 NestJS 端做与今天 `telegram-listener.ts` 完全一致的目标解析 + 去重（避免 Python 侧复制业务逻辑；未监控会话的消息在 NestJS 端被丢弃，成本可忽略）。

---

## 4. 现有 GramJS 模块功能边界与功能映射

| 现有职责（GramJS） | 新归属 |
|---|---|
| `sendCode` / `submitCode` / `submitPassword`（登录三步） | sidecar 持有 live client 执行；NestJS `TelegramClientManager` 代理转发 |
| `phoneCodeHash` 暂存 | sidecar 内存维护（按 phone 索引） |
| `connectWithSession` / `ensureClient`（连接 + 20s 超时） | sidecar 等价实现（Telethon `connect()` + 超时保护） |
| `saveSession`（导出 StringSession 字符串） | sidecar 导出 Telethon `StringSession` 字符串 |
| `getActiveClient` / `getCurrentPhone` / `isConnected`（状态查询） | sidecar 暴露 `/health` 与 `/status`；NestJS 代理查询 |
| `disconnect` / `onModuleDestroy`（清理） | sidecar 生命周期管理 |
| `addEventHandler(NewMessage)`（监听） | sidecar 内 `client.add_event_handler` |
| `toNormalizedMessage`（GramJS→Normalized） | Python 侧等价映射 |
| `findTelegramTargetByExternalId` + `messages.create` | **保留在 NestJS**（ingest 端点内） |
| 2FA 检测 `SESSION_PASSWORD_NEEDED` | sidecar 返回密码必要标志，NestJS 透传给前端 |

---

## 5. 数据结构与会话管理迁移

### 5.1 `TelegramAccount.session` 字段
- **现在**：`AES-256-GCM( GramJS StringSession )`，由 `EncryptionService` 加解密。
- **迁移后**：`AES-256-GCM( Telethon StringSession )`。**加密层（`EncryptionService`）完全不变**，仅内部载荷格式更换。
- 所有读写 session 的地方继续走 `encryption.encrypt/decrypt`，不受库切换影响。

### 5.2 现有会话的迁移（二选一，默认走方案 a）
- **(a) 重新登录（默认、零风险）**：本工具为自用/少量账号（1–2 个），上线时令旧 GramJS 会话失效，用户在 Web 重新走登录流程即可。sidecar 首次以 `TELEGRAM_DRIVER=python` 启动时，旧 `connected=true` 的 GramJS 会话无法被 Telethon 解析 → 登录端点强制重登，旧行 `connected=false`、清 session。
- **(b) 会话转换脚本（可选 best-effort）**：GramJS 与 Telethon 的 `StringSession` 都包含 `(dc_id, api_id, user_id, auth_key)` 原语，可实现 GramJS→Telethon 转换（社区有参考实现）。**仅作一次性可选工具，不在关键路径**；转换后必须人工验证登录有效再信任。

### 5.3 连接状态 / 多账号 / 超时 / 重连
- 多账号：`Map<phone, client>` 概念在 sidecar 内重建（Telethon 每个账号一个 `TelegramClient`）。
- 超时保护：保留 20s 连接超时、登录 30s 超时（sidecar 侧 `asyncio.wait_for`）。
- 重连：`reconnect` 端点 → sidecar 用存库 session 重连；DC 迁移/掉线由 Telethon 自动处理 + sidecar 自愈循环。
- `AuthKeyDuplicatedError`：同账号双活会互踢，见第 8 节灰度约束。

---

## 6. API 接口层与业务逻辑层兼容处理

- **`telegram.controller.ts`**：路由与 DTO 不变；内部调用从「直接调 GramJS 包装」改为「调 `TelegramClientManager`（现为 sidecar 代理）」。前端无感。
- **`TelegramClientManager` 改造为代理**：保留 `sendCode / submitCode / submitPassword / connectWithSession / getActiveClient / getCurrentPhone / isConnected / disconnect / saveSession` 同名方法，内部改为对 sidecar 的 HTTP 调用（如 `POST /sidecar/login/start` 等）。依赖它的 `TelegramService`、`TelegramAuthService`、`health.service.ts` **调用点几乎不动**。
- **登录流代理**：`telegram-auth.service.ts` 的 `persistSession` 改为接收 sidecar 返回的 Telethon session 字符串 → `encryption.encrypt` → 入库。
- **监听流外移**：删除（或按 flag 停用）NestJS 侧 `TelegramListener` 的 GramJS handler；新增 `POST /internal/telegram/ingest` 处理器，内部执行原 `telegram-listener.ts` 的「目标解析 + `MessageService.create`」逻辑。
- **健康检查**：`health.service.ts#checkTelegram()` 改为查询 sidecar `/health`，返回 `up/down/not_configured`；Bot API 检查（`checkTelegramBot`）不变。
- **`MessageService` 复用**：ingest 端点直接复用现有去重/目标解析/通知触发，确保行为一致。

---

## 7. 迁移实施阶段（任务拆解）

- **Phase 0 准备**
  - 在 `apps/telegram-worker/` 初始化 Python 服务（uv/venv + Telethon + fastapi/flask 或纯 aiohttp）。
  - 复用 `scripts/tg_watch.py` 作为监听参考实现。
- **Phase 1 sidecar 核心**
  - Telethon 客户端管理、登录三步（含 `phone_code_hash`、2FA）、`StringSession` 导出、连接/超时/重连、健康检查端点。
- **Phase 2 ingest 对接**
  - sidecar `NewMessage` → 映射为 `NormalizedMessage` JSON → `POST /internal/telegram/ingest`。
  - NestJS 新增 ingest 端点 + 内部鉴权头；内部逻辑复用 `message.repository.findTelegramTargetByExternalId` + `message.service.create`。
- **Phase 3 代理层改造**
  - `TelegramClientManager` 改为 sidecar 代理；`TelegramService`/`TelegramAuthService`/controller 适配；`health.service.ts` 改造。
- **Phase 4 存量会话**
  - 默认重登路径；可选实现 GramJS→Telethon 转换脚本。
- **Phase 5 前端/部署**
  - `docker-compose` 增加 sidecar 服务；环境变量 `TELEGRAM_DRIVER`、`INTERNAL_API_SECRET`、`TELEGRAM_SIDECAR_URL`。
- **Phase 6 清理**
  - 移除 GramJS 依赖（`telegram` npm 包）与 `telegram-listener.ts` 的 GramJS 代码路径（保留于 feature flag 下以支撑回滚）。

---

## 8. 灰度切换与回滚

### 8.1 关键约束
- **同一 Telegram 账号不能双活**：两个 live client 会互踢（`AuthKeyDuplicatedError`）。因此 GramJS 与 Python **不能对同一账号同时运行**。

### 8.2 特性开关
- 引入 `TELEGRAM_DRIVER=gramjs|python`（进程级）。
- `=python`：NestJS `TelegramClientManager` 代理 sidecar，NestJS 内 GramJS listener **不启动**。
- `=gramjs`：沿用现状（回滚态）。

### 8.3 回滚步骤
1. 停 sidecar 进程。
2. 将 `TELEGRAM_DRIVER` 设为 `gramjs` 并重启 NestJS。
3. 受影响账号在 Web 重新登录（旧 GramJS session 仍可用，无需重登）。
- 因 GramJS 代码在 flag 下保留，**回滚无需代码回退**，仅改配置 + 重启。

### 8.4 金丝雀
- 少量账号场景：可先对单个账号用 `python` 驱动验证，其余保持 `gramjs`；或单独起一个 sidecar 实例灰度。
- 验收标准：同账号在 GramJS 漏收的频道消息，Python 侧能稳定捕获并进入 `Message` 表。

---

## 9. 测试验证要点

- **单元**
  - `mapper` 等价性：给定等价消息，Telethon 映射结果 = GramJS 映射结果（同 `NormalizedMessage` 字段）。
  - `EncryptionService` session 加解密 round-trip 不变。
- **集成（sidecar）**
  - 用测试 session 连接 → `events.NewMessage` 在测试频道发消息时触发 → `POST /ingest` → 断言 NestJS 生成 `Message` 行 + `NotificationTask` 行。
  - `status/dialogs/channels/groups` 经代理返回结构与现一致。
- **E2E 对比（决定性验收）**
  - 同一账号对比：GramJS 漏收期间，Python sidecar 应捕获到对应消息。这是本迁移的核心验收点。
- **登录流**
  - start → code →（2FA password）→ session 持久化 → 重启后 `reconnect` 能恢复监听。
- **健康/可观测**
  - `GET /health` 的 `telegram` 项在 sidecar 在线时 `up`、离线时 `down`。
- **长稳**
  - sidecar 连续运行 24h+，DC 迁移/掉线自愈，无内存泄漏，正确处理 `AuthKeyDuplicatedError`（提示重登）。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| GramJS→Telethon 会话转换失败/不可靠 | 默认走重登路径；转换脚本仅 best-effort 且需人工验证 |
| sidecar 进程不可用导致监听中断 | 健康检查 + 告警；`TELEGRAM_DRIVER` 一键回滚到 GramJS |
| 同账号双活互踢 | 严格按 `TELEGRAM_DRIVER` 单驱动；禁止同时启用 |
| Telethon 对新 TL schema 滞后 | 锁定已验证版本；监控 Telegram 登录异常 |
| sidecar 转发未监控消息带来轻微开销 | NestJS 端即时丢弃；如需优化再让 sidecar 拉取监控目标白名单 |

---

## 11. 待确认 / 开放问题
- 是否接受「默认重登」而非自动转换存量会话？（影响上线体验）
- sidecar 与 NestJS 间是否引入 Redis/BullMQ 做异步削峰，还是直接 HTTP ingest？（本规划默认 HTTP）
- `TELEGRAM_DRIVER` 粒度：进程级还是账号级？
- sidecar 是否复用现有 `apps/api` 的 `.env`（API_ID/HASH/DB/ENCRYPTION_KEY）？
