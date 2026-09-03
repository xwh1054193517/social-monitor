# Social Monitor API

Base URL:

```text
/api
```

API 使用 JSON。

---

# 1. Response Format

成功：

```json
{
  "data": {}
}
```

列表：

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

错误：

```json
{
  "statusCode": 400,
  "message": "Invalid request",
  "code": "INVALID_REQUEST"
}
```

---

# 2. Monitor API

## GET /api/monitors

获取监控对象。

Query：

```text
page
pageSize
type
enabled
keyword
```

Example：

```text
GET /api/monitors?page=1&pageSize=20&type=X_USER
```

Response：

```json
{
  "data": [
    {
      "id": "clxxx",
      "type": "X_USER",
      "name": "OpenAI",
      "username": "OpenAI",
      "externalId": "44196397",
      "enabled": true,
      "lastMessageAt": "2026-09-02T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

# 3. Create Monitor

## POST /api/monitors

Request：

```json
{
  "type": "X_USER",
  "name": "OpenAI",
  "username": "OpenAI"
}
```

Telegram：

```json
{
  "type": "TG_CHANNEL",
  "name": "OpenAI News",
  "externalId": "-100123456789"
}
```

Response：

```json
{
  "data": {
    "id": "clxxx",
    "type": "X_USER",
    "name": "OpenAI",
    "username": "OpenAI",
    "externalId": "44196397",
    "enabled": true
  }
}
```

---

# 4. Get Monitor

## GET /api/monitors/:id

Response：

```json
{
  "data": {
    "id": "clxxx",
    "type": "X_USER",
    "name": "OpenAI",
    "username": "OpenAI",
    "externalId": "44196397",
    "enabled": true,
    "lastMessageAt": null
  }
}
```

---

# 5. Update Monitor

## PATCH /api/monitors/:id

Request：

```json
{
  "name": "OpenAI Official",
  "enabled": true
}
```

---

# 6. Delete Monitor

## DELETE /api/monitors/:id

成功：

```json
{
  "data": true
}
```

---

# 7. Enable Monitor

## POST /api/monitors/:id/enable

Response：

```json
{
  "data": true
}
```

---

# 8. Disable Monitor

## POST /api/monitors/:id/disable

Response：

```json
{
  "data": true
}
```

---

# 9. Check Monitor

## POST /api/monitors/:id/check

用于检查目标是否有效。

X：

```text
username
 ↓
X API
 ↓
是否存在
```

Telegram：

```text
chatId / username
 ↓
GramJS
 ↓
是否存在
```

Response：

```json
{
  "data": {
    "valid": true,
    "name": "OpenAI"
  }
}
```

---

# 10. Message API

## GET /api/messages

Query：

```text
page
pageSize
source
targetId
keyword
dateFrom
dateTo
```

Example：

```text
GET /api/messages?source=TELEGRAM&keyword=OpenAI
```

Response：

```json
{
  "data": [
    {
      "id": "msg_xxx",
      "source": "TELEGRAM",
      "target": {
        "id": "target_xxx",
        "name": "OpenAI News"
      },
      "author": {
        "username": "openai"
      },
      "content": "OpenAI announces...",
      "url": "https://t.me/openai_news/123",
      "publishedAt": "2026-09-02T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

# 11. Get Message

## GET /api/messages/:id

Response：

```json
{
  "data": {
    "id": "msg_xxx",
    "source": "TELEGRAM",
    "target": {
      "id": "target_xxx",
      "name": "OpenAI News"
    },
    "author": {
      "externalId": "123",
      "username": "openai",
      "displayName": "OpenAI"
    },
    "content": "OpenAI announces...",
    "url": "https://t.me/openai_news/123",
    "publishedAt": "2026-09-02T10:00:00.000Z"
  }
}
```

注意：

Response 中不包含：

```text
media
image
video
attachment
```

---

# 12. Message Notifications

## GET /api/messages/:id/notifications

Response：

```json
{
  "data": [
    {
      "id": "task_xxx",
      "channel": {
        "id": "channel_xxx",
        "name": "Telegram Bot",
        "type": "TELEGRAM"
      },
      "status": "SENT",
      "attempts": 1,
      "sentAt": "2026-09-02T10:01:00.000Z"
    }
  ]
}
```

---

# 13. Telegram Login

## POST /api/telegram/login/start

Request：

```json
{
  "phone": "+123456789"
}
```

Response：

```json
{
  "data": {
    "phoneCodeHash": "xxx"
  }
}
```

---

# 14. Telegram Login Code

## POST /api/telegram/login/code

Request：

```json
{
  "phone": "+123456789",
  "phoneCodeHash": "xxx",
  "code": "12345"
}
```

如果需要 2FA：

```json
{
  "data": {
    "needPassword": true
  }
}
```

---

# 15. Telegram Password

## POST /api/telegram/login/password

Request：

```json
{
  "phone": "+123456789",
  "password": "******"
}
```

Response：

```json
{
  "data": {
    "connected": true
  }
}
```

Password 不存数据库。

---

# 16. Telegram Status

## GET /api/telegram/status

Response：

```json
{
  "data": {
    "connected": true,
    "phone": "+123456789"
  }
}
```

绝对不能返回：

```text
session
apiHash
```

---

# 17. Telegram Dialogs

## GET /api/telegram/dialogs

Response：

```json
{
  "data": [
    {
      "id": "-100123456789",
      "title": "OpenAI News",
      "username": "openai_news",
      "type": "CHANNEL",
      "isChannel": true,
      "isGroup": false
    }
  ]
}
```

---

# 18. Telegram Channels

## GET /api/telegram/channels

返回当前账号可以访问的 Channel。

---

# 19. Telegram Groups

## GET /api/telegram/groups

返回当前账号可以访问的 Group。

---

# 20. Telegram Reconnect

## POST /api/telegram/reconnect

重新连接 GramJS Client。

Response：

```json
{
  "data": {
    "connected": true
  }
}
```

---

# 21. Notification Channel

## GET /api/notifications/channels

Query：

```text
type
enabled
```

---

# 22. Create Notification Channel

## POST /api/notifications/channels

Telegram：

```json
{
  "name": "Telegram Bot",
  "type": "TELEGRAM",
  "config": {
    "botToken": "xxx",
    "chatId": "123"
  }
}
```

注意：

API 接收到后：

```text
加密
 ↓
数据库
```

不能明文存储。

---

# 23. WeChat Channel

Request：

```json
{
  "name": "企业微信",
  "type": "WECHAT",
  "config": {
    "webhookUrl": "https://..."
  }
}
```

Webhook 必须加密存储。

---

# 23a. QQ Channel（官方机器人）

QQ 官方机器人主动消息，使用群 `groupOpenid`（非群号）。

Request：

```json
{
  "name": "QQ群监控通知",
  "type": "QQ",
  "config": {
    "groupOpenid": "9B159252..."
  }
}
```

说明：

- `groupOpenid` 从机器人被拉入群时的 `GROUP_ADD_ROBOT` 事件获取，后端日志会打印。
- QQ 凭据（`QQ_APP_ID` / `QQ_APP_SECRET`）在 `.env` 配置，不随渠道 `config` 传递。
- 未认证群主动消息限频 30/qpm、每群 1000 条/天，需开启「机器人主动在群聊内发言」权限。

---

# 24. Get Notification Channel

## GET /api/notifications/channels/:id

敏感配置不能直接返回。

返回：

```json
{
  "data": {
    "id": "channel_xxx",
    "name": "Telegram Bot",
    "type": "TELEGRAM",
    "enabled": true,
    "config": {
      "configured": true
    }
  }
}
```

---

# 25. Update Notification Channel

## PATCH /api/notifications/channels/:id

例如：

```json
{
  "name": "Telegram Main",
  "enabled": true
}
```

---

# 26. Delete Notification Channel

## DELETE /api/notifications/channels/:id

---

# 27. Test Notification

## POST /api/notifications/channels/:id/test

系统发送：

```text
Social Monitor 测试消息
```

Response：

```json
{
  "data": {
    "success": true
  }
}
```

---

# 28. Notification Tasks

## GET /api/notifications/tasks

Query：

```text
page
pageSize
status
channelId
dateFrom
dateTo
```

---

# 29. Notification Task Detail

## GET /api/notifications/tasks/:id

Response：

```json
{
  "data": {
    "id": "task_xxx",
    "status": "SENT",
    "attempts": 1,
    "lastError": null,
    "sentAt": "2026-09-02T10:00:00.000Z"
  }
}
```

---

# 30. Dashboard

## GET /api/dashboard/overview

Response：

```json
{
  "data": {
    "todayMessages": 120,
    "xMessages": 50,
    "telegramMessages": 70,
    "monitorCount": 15,
    "enabledMonitorCount": 12,
    "notificationSuccess": 110,
    "notificationFailed": 3
  }
}
```

---

# 31. SSE

## GET /api/events

Content-Type：

```text
text/event-stream
```

事件：

```text
message.created
notification.sent
notification.failed
monitor.status_changed
```

Example：

```text
event: message.created
data: {"messageId":"xxx"}
```

---

# 32. API Security Rules

MVP 不做复杂 RBAC。

但是：

- Sensitive config 不返回前端
- Telegram Session 不返回
- Bot Token 不返回
- API Secret 不返回
- Webhook URL 不返回
- Password 不保存

---

# 33. Pagination

统一：

```text
page
pageSize
```

默认：

```text
page = 1
pageSize = 20
```

最大：

```text
pageSize = 100
```

防止一次查询大量消息。
