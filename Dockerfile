# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build
# Ensure index.html lands in dist (webpack plugin does it, belt-and-suspenders)
RUN cp -n public/index.html dist/index.html 2>/dev/null || true
RUN ls -la dist/   # show what was built for debugging

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:20-alpine AS production
# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ .

# Copy built frontend
COPY --from=frontend-builder /frontend/dist /app/frontend

# Verify frontend build landed correctly
RUN ls -la /app/frontend/

RUN mkdir -p /data/uploads/equipment /data/uploads/company

EXPOSE 3000
CMD ["node", "server.js"]
