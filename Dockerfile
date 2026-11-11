# syntax=docker/dockerfile:1

# Debian (glibc) for every stage: the runtime is MongoDB's Ubuntu image, since
# mongod doesn't run on Alpine, and native modules must match its libc.
FROM node:22-bookworm-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# The migrate-mongo CLI and its MongoDB driver in their own dependency tree,
# so the entrypoint can run migrations. next build's standalone trace only
# includes what the app imports, and the app never imports the CLI.
FROM base AS migrate-cli
WORKDIR /migrate-cli
COPY package-lock.json ./
RUN node -e "const p=require('./package-lock.json').packages; require('fs').writeFileSync('pkgs.txt', ['migrate-mongo','mongodb'].map(n => n+'@'+p['node_modules/'+n].version).join(' '))" \
  && rm package-lock.json \
  && npm init -y > /dev/null \
  && npm install --no-audit --no-fund $(cat pkgs.txt) \
  && rm pkgs.txt

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# Pin explicitly rather than relying on the base image defaulting to UTC
ENV TZ=UTC

RUN npm run build

# Production image: MongoDB's official image (Ubuntu, amd64 and arm64) with
# Node added, so one container runs both. Set DATABASE_URL to use an external
# MongoDB instead; the bundled one then never starts.
FROM mongo:8.0 AS runner
COPY --from=base /usr/local/bin/node /usr/local/bin/node
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Pin explicitly rather than relying on the base image defaulting to UTC
ENV TZ=UTC
# Derive callback URLs from the request Host header so the same image serves
# localhost and LAN addresses. Without an x-forwarded-proto header this assumes
# https, which yields Secure cookies a plain-HTTP client will discard, so
# HTTP deployments must pin the origin with NEXTAUTH_URL.
ENV AUTH_TRUST_HOST=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --no-create-home nextjs

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Standalone output leaves out public/ (e.g. the workout voice clips).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
# Data migrations, applied by the entrypoint on every start
COPY --from=builder --chown=nextjs:nodejs /app/migrate-mongo-config.js ./migrate-mongo-config.js
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=migrate-cli /migrate-cli/node_modules ./migrate-cli/node_modules

# The volume holds MongoDB's files (data/db); pre-created so a named volume
# inherits this ownership.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

RUN chmod +x docker-entrypoint.sh

USER nextjs

VOLUME ["/app/data"]

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
