FROM node:20-alpine

# Production dependencies only
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production --silent

COPY . .

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# 800MB heap ceiling on 1GB machine — leaves headroom for V8 + OS
CMD ["node", "--max-old-space-size=800", "--gc-interval=100", "server.js"]
