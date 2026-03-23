# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Install dependencies first (cached layer unless package.json changes)
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY frontend/ .
RUN npm run build

# Guarantee index.html is in dist
RUN cp -f public/index.html dist/index.html

# Confirm build output
RUN echo "=== Frontend build output ===" && ls -la dist/

# ── Stage 2: Production image ───────────────────────────────────────────────
FROM node:20-alpine AS production

# better-sqlite3 requires native compilation tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./
RUN npm install --production

# Copy backend source
COPY backend/ .

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist /app/frontend

# Confirm frontend landed
RUN echo "=== App frontend ===" && ls -la /app/frontend/

# Create data directories
RUN mkdir -p /data/uploads/equipment /data/uploads/company

EXPOSE 3000
CMD ["node", "server.js"]
