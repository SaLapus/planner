# Planner image. Build context is the REPO ROOT (the pnpm lockfile lives there):
#   docker build -f planner/Dockerfile .
# Needs Node 24+ because the database is the built-in `node:sqlite`.

FROM node:26-slim AS build
WORKDIR /app
# pnpm's standalone installer (what pnpm recommends for Docker). The slim image has
# no wget/certs, so add them here; this stage is thrown away, so the final image stays lean.
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && wget -qO- https://get.pnpm.io/install.sh | env PNPM_VERSION=11.24.0 ENV="$HOME/.shrc" SHELL="$(which sh)" sh - \
 && pnpm --version
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY planner/package.json planner/package.json
# adapter-node bundles devDependencies into the build but leaves `dependencies` as imports from
# node_modules, which the final image does not have. So every package the app uses must be a
# devDependency; a package in `dependencies` would crash the app at start (ERR_MODULE_NOT_FOUND).
RUN node -e "const d = Object.keys(require('./planner/package.json').dependencies || {}); if (d.length) { console.error('planner/package.json: move to devDependencies (the image has no node_modules): ' + d.join(', ')); process.exit(1); }"
RUN pnpm install --frozen-lockfile
COPY planner planner
RUN pnpm --filter planner build

FROM node:26-slim
WORKDIR /app
# The adapter-node build is self-contained (all packages are devDependencies, see above): no node_modules.
COPY --from=build /app/planner/build ./build
COPY --from=build /app/planner/package.json ./package.json
COPY planner/scripts/backup.mjs ./backup.mjs

# Behind Caddy: believe its forwarded headers so the app sees https://plan.<domain>
# (needed for the same-origin/CSRF check and Secure cookies). Safe because only Caddy can reach this port.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    ADDRESS_HEADER=x-forwarded-for \
    XFF_DEPTH=1 \
    PLANNER_DB=/data/planner.db \
    BACKUP_DIR=/backups

# SQLite lives here; mount a volume on it. Owned by the unprivileged `node` user.
RUN mkdir /data /backups && chown node:node /data /backups
VOLUME /data
VOLUME /backups
USER node
EXPOSE 3000
CMD ["node", "build"]
