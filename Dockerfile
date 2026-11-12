FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Shown in the page footer. The CI workflow passes the commit being built.
ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA
RUN npm run build

# Runs as UID 101 and listens on 8080, so it needs no root and no capabilities.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
