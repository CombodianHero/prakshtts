# ============================================================
# Prakash Tour & Travels — Koyeb deployment image
# ============================================================
FROM node:24-slim
WORKDIR /app

# OpenSSL is required by Prisma's query engine on Debian-based images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package.json + the Prisma schema BEFORE `npm install`, since
# `npm install` triggers the "postinstall": "prisma generate" script,
# which needs prisma/schema.prisma to already be present.
COPY package.json ./
COPY prisma ./prisma
RUN npm install --omit=dev

# Now copy the rest of the app (server.js, static site, api/, lib/)
COPY . .

ENV NODE_ENV=production
EXPOSE 8000
ENV PORT=8000

CMD ["node", "server.js"]
