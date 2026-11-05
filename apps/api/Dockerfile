# Contexto de build: a raiz do repositório (docker build -f apps/api/Dockerfile .)
FROM node:22.17.1-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @dbwatch/api...
COPY tsconfig.base.json ./
COPY apps/api apps/api
# O prisma.config.ts exige a variável só para carregar; o valor não é usado no build
RUN MIGRATOR_DATABASE_URL=postgres://build:build@localhost:5432/build pnpm --filter @dbwatch/api build
RUN pnpm --filter @dbwatch/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist

# Ferramentas de operação (migrations, banco-alvo e seed): usa as dependências de desenvolvimento
FROM build AS tools
COPY infra/target infra/target
RUN chown -R node:node /repo
USER node
WORKDIR /repo/apps/api

FROM node:22.17.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
