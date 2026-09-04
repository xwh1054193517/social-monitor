# telegram-worker（Python sidecar）

用 **Telethon** 替代 GramJS 的 Telegram 用户客户端 sidecar，负责：

- 登录三步流程（发送验证码 → 提交验证码 → 2FA 密码），`phone_code_hash` 由本进程内存持有
- 持久化会话连接（Telethon `StringSession`，NestJS 负责加密入库）
- `NewMessage` 监听，把捕获到的消息转发给 NestJS 内部 ingest 端点

业务逻辑（去重、监控目标解析、通知路由）全部留在 NestJS。

## HTTP 接口（供 NestJS `TelegramClientManager` 代理调用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` `/status` | 健康检查 / 当前连接状态 |
| POST | `/login/start` `{phone}` | 发送验证码，返回 `phoneCodeHash` |
| POST | `/login/code` `{phone, code}` | 提交验证码；2FA 时返回 `passwordRequired: true` |
| POST | `/login/password` `{phone, password}` | 提交 2FA 密码 |
| POST | `/save-session` `{phone}` | 导出 Telethon StringSession 字符串 |
| POST | `/connect` `{phone, session}` | 用会话字符串连接并开始监听 |
| POST | `/disconnect` `{phone}` | 断开并清理 |
| GET | `/dialogs` `/channels` `/groups` | 会话列表（`{data: [...]}`） |

除 `/health` 外均要求 `X-Internal-Secret` 请求头（与 NestJS 共享 `INTERNAL_API_SECRET`）。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | — | 必填，Telegram API 凭据 |
| `TELEGRAM_INGEST_URL` | `http://localhost:3001/api/internal/telegram/ingest` | NestJS ingest 地址 |
| `INTERNAL_API_SECRET` | — | 内部共享密钥 |
| `TELEGRAM_WORKER_HOST` / `TELEGRAM_WORKER_PORT` | `0.0.0.0` / `9400` | 监听地址 |
| `TELEGRAM_CONNECT_TIMEOUT` | `20` | 连接超时（秒） |

## 本地运行

```bash
cd apps/telegram-worker
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
.venv/Scripts/python worker.py
```

## 部署

`docker-compose.prod.yml` 已包含 `telegram-worker` 服务；NestJS 通过
`TELEGRAM_SIDECAR_URL=http://telegram-worker:9400` 访问。
