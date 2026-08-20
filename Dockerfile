# ============================================================
# Prakash Tour & Travels — Koyeb Production Dockerfile
# ============================================================

FROM node:24-bookworm-slim

WORKDIR /app

# Copy dependency files first for Docker cache
COPY package.json package-lock.json ./

# Copy Prisma schema before npm install
COPY prisma ./prisma

# Install production dependencies
RUN npm ci --omit=dev

# Generate Prisma Client
RUN npx prisma generate

# Copy application source
COPY . .

# Production environment
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Start application
CMD ["node", "server.js"]
