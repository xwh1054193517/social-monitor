# ---- Builder ----
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching.
# prisma/ is copied early so the @prisma/client postinstall (prisma generate)
# has a schema to read during `pnpm install` (the root workspace depends on it).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY prisma/ prisma/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# Copy full source and build. The `...` suffix builds the web app together with
# its workspace dependency (@social-monitor/shared, which publishes to dist/).
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV STANDALONE=true
RUN pnpm --filter @social-monitor/web... build

# ---- Runner ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output: copy the self-contained server bundle
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
