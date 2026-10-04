FROM node:26-alpine AS deps
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Final image: plain Alpine plus only the node binary and its two runtime libraries.
# No npm, npx, corepack or yarn, and no Node base-image tooling.
FROM alpine:3.24
LABEL org.opencontainers.image.licenses="MIT"
RUN apk add --no-cache libstdc++ \
    && addgroup -S -g 1000 node && adduser -S -u 1000 -G node -s /sbin/nologin node
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node src/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
