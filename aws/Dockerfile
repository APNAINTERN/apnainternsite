# EzyIntern API — AWS container image
# Build from repo root:  docker build -f aws/Dockerfile -t ezyintern-api .
# Run locally:           docker run --rm -p 3000:3000 --env-file .env ezyintern-api

FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY api ./api
COPY aws ./aws
COPY server.cjs ./server.cjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "aws/server/index.ts"]
