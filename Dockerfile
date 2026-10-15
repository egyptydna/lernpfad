# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci; else npm ci; fi
COPY . .
RUN NEXT_TELEMETRY_DISABLED=1 npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/app/.data COOKIE_SECURE=true
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0"]
