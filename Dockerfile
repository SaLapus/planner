# Planner image. Build context is the REPO ROOT (the pnpm lockfile lives there):
#   docker build -f planner/Dockerfile .
# Needs Node 24+ because the database is the built-in `node:sqlite`.

FROM node:26-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.24.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY planner/package.json planner/package.json
RUN pnpm install --frozen-lockfile
COPY planner planner
RUN pnpm --filter planner build

FROM node:26-slim
WORKDIR /app
# The adapter-node build is self-contained: no node_modules needed at runtime.
COPY --from=build /app/planner/build ./build
COPY --from=build /app/planner/package.json ./package.json

# Behind Caddy: believe its forwarded headers so the app sees https://plan.<domain>
# (needed for the same-origin/CSRF check and Secure cookies). Safe because only Caddy can reach this port.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    ADDRESS_HEADER=x-forwarded-for \
    XFF_DEPTH=1 \
    PLANNER_DB=/data/planner.db

# SQLite lives here; mount a volume on it. Owned by the unprivileged `node` user.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
CMD ["node", "build"]
