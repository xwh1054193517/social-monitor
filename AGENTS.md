# Social Monitor

Follow the architecture and phased delivery rules in [Agent.md](./Agent.md).

Current phase: Phase 1 - Monorepo infrastructure.

Hard rules for this repository:

- TypeScript only for application code.
- NestJS backend under `apps/api`.
- Next.js frontend under `apps/web`.
- Shared packages under `packages/*`.
- Do not store or process image/video/media payloads.
- Do not log secrets or return sensitive config through APIs.
- Complete each phase with `pnpm lint`, `pnpm test`, and `pnpm build`.
