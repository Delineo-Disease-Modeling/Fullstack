# Delineo Fullstack
# Next.js frontend + API with Prisma/PostgreSQL
# Port: 3000
#
# Multi-stage build:
#   1. deps     — install node_modules (cached by lockfile)
#   2. builder  — build Next.js
#   3. runner   — production image

FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

# Dependencies
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc* ./
COPY prisma/ prisma/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

# These are needed at build time for Next.js to inline public env vars
ARG NEXT_PUBLIC_SIM_URL
ARG NEXT_PUBLIC_ALG_URL
ENV NEXT_PUBLIC_SIM_URL=$NEXT_PUBLIC_SIM_URL
ENV NEXT_PUBLIC_ALG_URL=$NEXT_PUBLIC_ALG_URL

RUN pnpm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built output and production dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 3000

CMD ["pnpm", "start"]
