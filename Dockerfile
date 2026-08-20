FROM node:24-bookworm-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Create/update database tables, then start server
CMD ["sh", "-c", "npx prisma db push && node server.js"]
