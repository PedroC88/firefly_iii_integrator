FROM node:22-alpine AS deps
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
LABEL org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node src/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
