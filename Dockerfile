# claudefi Dockerfile
# The open source claude agent that learns to trade defi
#
# Usage:
#   docker build -t claudefi/claudefi .
#   docker run -e ANTHROPIC_API_KEY=sk-... claudefi/claudefi

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PAPER_TRADING=true

# Copy necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Create non-root user
RUN addgroup --system --gid 1001 claudefi && \
    adduser --system --uid 1001 claudefi
USER claudefi

# Default command - run the ralph loop
CMD ["bun", "run", "src/orchestrator/ralph-loop.ts"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
