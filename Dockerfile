# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
# --ignore-scripts skips postinstall (prisma generate) which fails under QEMU
# emulation; prisma generate is run explicitly in the builder stage instead.
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# The Prisma CLI in its own dependency tree, so the runtime image can apply
# migrations. next build's standalone trace excludes it, and copying
# node_modules/@prisma piecemeal misses transitive deps such as `effect`.
# Scripts run here so @prisma/engines downloads the schema-engine binary.
FROM base AS prisma-cli
WORKDIR /prisma-cli
COPY package-lock.json ./
RUN node -e "require('fs').writeFileSync('v.txt', require('./package-lock.json').packages['node_modules/prisma'].version)" \
  && rm package-lock.json \
  && npm init -y > /dev/null \
  && npm install --no-audit --no-fund prisma@$(cat v.txt) \
  && rm v.txt

# npm does not fail the build when @prisma/engines' postinstall download fails,
# which would silently ship an image that cannot migrate. Fail loudly instead.
RUN ls node_modules/@prisma/engines/schema-engine-* > /dev/null 2>&1 \
  || (echo "ERROR: Prisma schema-engine binary was not downloaded" && exit 1)

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# Pin explicitly rather than relying on the base image defaulting to UTC
ENV TZ=UTC

# Generate Prisma client (postinstall was skipped with --ignore-scripts)
RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
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
# Absolute path: a relative file: URL would resolve against prisma/ in the read-only image layer
ENV DATABASE_URL="file:/app/data/Clear-Calorie.db"
# Stop the Prisma CLI from phoning home for version checks at container start
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Standalone output leaves out public/ (e.g. the workout voice clips).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh

# next build's standalone trace excludes the Prisma CLI, so ship it in its own
# node_modules tree (kept out of /app/node_modules to avoid clobbering the
# generated client) so the entrypoint can run `migrate deploy` without network.
COPY --from=prisma-cli /prisma-cli/node_modules ./prisma-cli/node_modules

# Mount point for the SQLite database; pre-created so a named volume inherits this ownership
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
