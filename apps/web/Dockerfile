# Build context is the REPO ROOT (the web app depends on packages/shared via npm workspaces).
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace=@thekapita/web --include-workspace-root

COPY packages packages
COPY apps/web apps/web

# Baked into the JS bundle at build time. Set in Railway, e.g.
# VITE_API_BASE_URL=https://<backend-domain>/api
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace=@thekapita/web

FROM nginx:1.27-alpine
# nginx image runs envsubst on /etc/nginx/templates/*.template at start, so ${PORT} is filled in.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
