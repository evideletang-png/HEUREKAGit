FROM node:20-alpine AS base

# System libs required by canvas / image-processing packages
RUN apk add --no-cache \
    pixman-dev \
    cairo-dev \
    pango-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    python3 \
    make \
    g++

RUN npm install -g pnpm@9.15.9

# ── Install dependencies ────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy every package.json so pnpm can resolve the workspace graph
COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/
COPY packages/db/package.json                              ./packages/db/
COPY packages/ai-core/package.json                         ./packages/ai-core/
COPY packages/api-zod/package.json                         ./packages/api-zod/
COPY packages/api-spec/package.json                        ./packages/api-spec/
COPY packages/api-client-react/package.json                ./packages/api-client-react/
COPY packages/integrations-openai-ai-server/package.json   ./packages/integrations-openai-ai-server/
COPY packages/integrations-openai-ai-react/package.json    ./packages/integrations-openai-ai-react/

RUN pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY . .

# 1. Build shared packages (db, api-zod, etc.)
RUN pnpm --filter "@workspace/db" --if-present run build
RUN pnpm --filter "@workspace/api-zod" --if-present run build
RUN pnpm --filter "@workspace/ai-core" --if-present run build
RUN pnpm --filter "@workspace/api-client-react" --if-present run build
RUN pnpm --filter "@workspace/integrations-openai-ai-server" --if-present run build
RUN pnpm --filter "@workspace/integrations-openai-ai-react" --if-present run build

# 2. Build frontend → apps/web/dist/public
RUN pnpm --filter "@workspace/heureka" run build

# 3. Build backend → apps/api/dist/index.cjs
RUN pnpm --filter "@workspace/api-server" run build

# ── Production image ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache pixman cairo pango libpng libjpeg-turbo

WORKDIR /app

# Only copy what the server needs at runtime
COPY --from=builder /app/apps/api/dist         ./apps/api/dist
COPY --from=builder /app/apps/web/dist/public  ./apps/web/dist/public
COPY --from=builder /app/node_modules          ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 8080

CMD ["node", "apps/api/dist/index.cjs"]
