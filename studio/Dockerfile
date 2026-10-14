# syntax=docker/dockerfile:1
# Brand Studio: build with Vite (base /studio/), serve the static files with nginx (unprivileged, port 8080) under /studio/.
#   docker build -t brandshield-studio ./studio
# In docker-compose the BrandShield frontend nginx proxies /studio/ to this container, so the browser sees one origin.
# No environment variables and no keys are needed: the AI keys live on the BrandShield server.
# Not built or run in the authoring environment (no Docker there).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# The build uses base /studio/, so the files are placed in a studio/ folder: /studio/assets/x.js -> /usr/share/nginx/html/studio/assets/x.js
COPY --from=build /app/dist /usr/share/nginx/html/studio
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
