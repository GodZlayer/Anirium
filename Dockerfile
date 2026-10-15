# Multi-stage Dockerfile para Anirium Core
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Camada 2: Builder – normaliza CRLF→LF antes de compilar para evitar
# que o Turbopack produza hashes de módulo diferentes do Windows build.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/\r//' 2>/dev/null || true
RUN rm -rf .next/cache node_modules/.cache && npm run build

# Camada 3: Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/community-plugins/mal-sync ./community-plugins/mal-sync
COPY --from=builder /app/scripts/verify-core-runtime.mjs ./scripts/verify-core-runtime.mjs

USER nextjs
RUN node scripts/verify-core-runtime.mjs
EXPOSE 3000

CMD ["npm", "start"]
