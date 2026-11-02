FROM node:24-bookworm-slim AS base
RUN npm install --global pnpm@12.15.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/typst/package.json packages/typst/
# The skills approved under `permissions` in pnpm-workspace.yaml need a directory to link into,
# or pnpm 12 fails the install (ERR_PNPM_NO_AGENT_SKILLS_DIR). The image never uses them.
RUN mkdir -p .claude/skills && pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter web build
RUN pnpm install --frozen-lockfile --prod

# The fonts and their licence files ship in packages/typst/fonts.
FROM base
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app /app
WORKDIR /app/apps/web
VOLUME /data
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
