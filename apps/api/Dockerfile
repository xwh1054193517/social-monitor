# ---- Builder ----
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching.
# prisma/ is copied early so the @prisma/client postinstall (prisma generate)
# has a schema to read during `pnpm install`.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY prisma/ prisma/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# Copy full source and build. The `...` suffix builds the API together with its
# workspace dependencies (@social-monitor/shared, @social-monitor/types) in
# topological order — they publish to dist/ and are required by the API build.
COPY . .
RUN pnpm --filter @social-monitor/api... build
RUN npx prisma generate

# ---- Runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy the entire built workspace (pnpm symlinks make selective copy unreliable)
COPY --from=builder /app ./

ENV NODE_ENV=production
EXPOSE 3001

# Run migrations then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/api/dist/main.js"]
