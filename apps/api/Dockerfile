FROM oven/bun:1
WORKDIR /app

# Copy workspace manifests so bun install resolves the monorepo graph
COPY package.json ./
COPY bun.lockb* ./
COPY packages/battle-engine/package.json ./packages/battle-engine/
COPY apps/api/package.json ./apps/api/

RUN bun install

# Copy source after install to maximize cache hits
COPY packages/battle-engine/ ./packages/battle-engine/
COPY apps/api/ ./apps/api/

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
