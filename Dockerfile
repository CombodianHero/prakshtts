FROM node:24-bookworm-slim

WORKDIR /app

# Copy dependency files and Prisma schema first.
# npm ci runs "postinstall", which runs "prisma generate".
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Install exactly the versions recorded in package-lock.json.
RUN npm ci --include=prod

# Copy application source.
COPY . .

# Generate Prisma Client after the complete application is available.
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Synchronize the database schema, then start the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
