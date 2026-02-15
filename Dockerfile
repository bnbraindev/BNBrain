FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Solidity compiler (solc) and OpenZeppelin contracts are loaded dynamically
# inside a Worker thread eval context — Next.js bundler cannot trace them,
# so they must be copied manually into the standalone output.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/solc ./node_modules/solc
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/command-exists ./node_modules/command-exists
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/follow-redirects ./node_modules/follow-redirects
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/js-sha3 ./node_modules/js-sha3
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/memorystream ./node_modules/memorystream
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/tmp ./node_modules/tmp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/os-tmpdir ./node_modules/os-tmpdir
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@openzeppelin ./node_modules/@openzeppelin

RUN mkdir -p /app/.logs/prod && chown nextjs:nodejs /app/.logs/prod

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
