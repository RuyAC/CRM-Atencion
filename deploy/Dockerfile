FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
COPY server/reporting.mjs ./server/reporting.mjs
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DB_PATH=/var/lib/atencion/data/platform.sqlite MEDIA_DIR=/var/lib/atencion/uploads BACKUP_DIR=/var/backups/atencion
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /var/lib/atencion /var/backups/atencion && chown -R node:node /var/lib/atencion /var/backups/atencion
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY scripts/preflight.mjs ./scripts/preflight.mjs
COPY scripts/restore-full.mjs ./scripts/restore-full.mjs
COPY scripts/monitor.mjs ./scripts/monitor.mjs
COPY scripts/check-release.mjs ./scripts/check-release.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh","-c","node scripts/preflight.mjs && node server/index.mjs"]
