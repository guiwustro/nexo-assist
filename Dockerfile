# App web (Next.js standalone). Multi-stage: deps → build → runner enxuto, sem devDependencies.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# Migrations + seed-se-vazio num arquivo só, rodado com node puro no start.
RUN node_modules/.bin/esbuild lib/db/bootstrap.ts --bundle --platform=node --format=esm --target=node22 \
      --outfile=dist/bootstrap.mjs \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations
COPY --from=build --chown=node:node /app/dist/bootstrap.mjs ./db/bootstrap.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/v1/ping || exit 1
CMD ["sh", "-c", "node db/bootstrap.mjs && exec node server.js"]
