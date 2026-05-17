FROM oven/bun:1
WORKDIR /app

# Day 1 stub: no workspace deps needed.
# Day 5: update to copy root package.json + battle-engine for TanStack Start.
COPY apps/web/ .

EXPOSE 3000
CMD ["bun", "run", "index.ts"]
