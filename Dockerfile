FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
HEALTHCHECK --interval=1m --timeout=10s --retries=3 --start-period=30s \
  CMD pgrep -f "node worker.js" || exit 1

CMD ["node", "worker.js"]