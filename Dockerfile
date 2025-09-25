# Railway deployment Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies without cache
RUN npm ci --only=production --no-cache --prefer-offline

# Copy source code
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY seed.sql ./
COPY public/ ./public/

# Install dev dependencies and build
RUN npm install --no-cache
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "run", "railway:start"]