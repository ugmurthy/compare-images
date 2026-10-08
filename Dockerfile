# syntax=docker/dockerfile:1
FROM oven/bun:1.3.10-debian@sha256:367842b35abbdf23f39e23c71f3a08eee940ff2679a14e08a5afcf4a1436cd89 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

# These are PUBLIC browser configuration, never service-role or secret keys.
# For InstaCloud source builds, deploy/public-build.json supplies these instead.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN bun run deploy/build.ts

FROM nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8 AS runtime
ENV PORT=8080 NGINX_ENVSUBST_FILTER=^PORT$
# MicroVM stdio can be root-owned: inherit stderr rather than reopening its
# /dev/stderr symlink as nginx. No request logs means no callback-code logs.
RUN sed -i 's|error_log  /var/log/nginx/error.log notice;|error_log stderr warn;|; s|access_log  /var/log/nginx/access.log  main;|access_log off;|' /etc/nginx/nginx.conf
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["nginx", "-e", "stderr", "-g", "daemon off;"]
