FROM node:24-bookworm-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# IMPORTANT: Copy Prisma schema BEFORE npm ci
# because npm ci runs postinstall -> prisma generate
COPY prisma ./prisma

# Install dependencies
RUN npm ci

# Generate Prisma Client explicitly as well
RUN npx prisma generate

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

# Create/update database tables, then start the application
CMD ["sh", "-c", "npx prisma db push && node server.js"]
