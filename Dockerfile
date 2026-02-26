# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Menggunakan --omit=dev sesuai standar NPM terbaru 2026
RUN npm ci --omit=dev

# Final stage
FROM node:20-alpine
# Update: dumb-init di Alpine 3.x ada di /usr/bin/
RUN apk add --no-cache dumb-init
WORKDIR /app

# Buat folder auth dan set ownership ke user 1000 (Nasgun)
# Ini penting supaya Baileys bisa simpan file sesi WA
RUN mkdir -p auth_info_baileys && chown -R 1000:1000 /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY index.js ./

ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck menggunakan path internal
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/status', (res) => { if (res.statusCode !== 200) process.exit(1) })"

# FIX: Gunakan path yang benar untuk dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.js"]

EXPOSE 3000