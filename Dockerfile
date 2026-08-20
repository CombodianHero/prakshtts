FROM node:24-bookworm-slim

WORKDIR /app

# Copy dependency files first for Docker cache efficiency
COPY package.json package-lock.json ./

# Copy Prisma schema before dependency installation
COPY prisma ./prisma

# Install exact dependencies from the synchronized lock file
RUN npm ci

# Copy the remaining application source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Synchronize schema, then start the server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
