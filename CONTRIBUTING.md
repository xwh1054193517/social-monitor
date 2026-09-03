# 贡献指南

感谢你对 Social Monitor 的关注！本文档说明如何搭建开发环境、运行测试以及提交代码。

## 项目简介

Social Monitor 是一个多平台社交内容监控与转发系统：监听 Telegram 频道/群组、X（Twitter）用户等社交源，捕获新消息后通过 Telegram Bot 或 QQ 官方机器人转发到你的私人群/群聊。

## 开发环境要求

- **Node.js** 22+
- **pnpm** 10.33.0（`corepack enable` 后会自动使用仓库锁定版本）
- **PostgreSQL** 14+（本地或远程实例）
- **Redis** 6+（BullMQ 队列依赖）
- （可选）Telegram Bot Token / API 凭据、QQ 机器人 AppID/Secret

## 本地搭建

```bash
# 1. 安装依赖
pnpm install

# 2. 生成 Prisma Client
pnpm prisma:generate

# 3. 准备环境变量
cp .env.example .env
# 编辑 .env，填入数据库、Redis、Telegram、QQ 等真实凭据

# 4. 初始化数据库
pnpm prisma:migrate:deploy   # 或 pnpm prisma:migrate dev（开发时）

# 5. 启动前后端
pnpm dev
```

- API：http://localhost:3001（健康检查 `GET /health`）
- Web 仪表盘：http://localhost:3000

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 并行启动 API 与 Web |
| `pnpm lint` | 所有 workspace 的 ESLint |
| `pnpm test` | Jest 单元 + e2e 测试 |
| `pnpm build` | 构建全部包（nest build + next build） |
| `pnpm prisma:studio` | 打开 Prisma Studio 查看数据 |
| `pnpm format` / `pnpm format:check` | Prettier 格式化 / 校验 |

> 单元与 e2e 测试不依赖真实数据库/Redis（测试内 mock 了 `PrismaService` 与队列），`NODE_ENV=test` 下 BullMQ worker 会自动禁用。

## 目录结构

```
apps/
  api/        NestJS 后端（REST + SSE + BullMQ worker）
  web/        Next.js 前端仪表盘
packages/
  shared/     共享常量与工具
  types/      共享类型定义
prisma/       Prisma schema 与迁移
docs/         设计文档
```

## 提交规范

- 使用 Conventional Commits：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:` 等前缀。
- 提交前请确保 `pnpm lint`、`pnpm test`、`pnpm build` 三关通过。
- 一个提交聚焦一件事，避免混入无关改动。

## 提 Issue

- 使用清晰的标题描述问题或建议。
- Bug 请附上：环境（Node/pnpm 版本）、复现步骤、期望行为、实际行为、相关日志。
- 功能建议请说明使用场景与预期效果。

## 提 Pull Request

1. Fork 本仓库并创建功能分支（`feat/xxx` 或 `fix/xxx`）。
2. 完成改动并补充/更新测试。
3. 本地跑通 lint / test / build。
4. 提交 PR，描述改动动机与实现要点。

CI 会在 push/PR 时自动执行 lint / test / build，请确保全部通过。

## License

[MIT](LICENSE)
