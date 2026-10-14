# syntax=docker/dockerfile:1
# BrandShield frontend: build with Vite, serve static files with nginx (unprivileged, port 8080).
#   docker build -t brandshield-frontend ./frontend
#   docker run -p 5173:8080 -e API_URL=https://api.example.com brandshield-frontend
# The API address is a RUNTIME setting (API_URL, written to /config.js at start). VITE_API_URL is only the build-time fallback.
# Not built or run in the authoring environment (no Docker there): see docs/DECISIONS.md.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ENV API_URL=http://localhost:8000
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0755 nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
