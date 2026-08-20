FROM node:24-bookworm-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Copy Prisma schema before npm install
COPY prisma ./prisma

# Install dependencies and allow npm to update dependency resolution
RUN npm install --ignore-scripts

# Copy application source
COPY . .

# Generate Prisma Client after the complete Prisma schema is available
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Sync Prisma schema, then start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
