# Use Node.js LTS with security updates
FROM node:20-alpine3.19

# Set working directory
WORKDIR /app

# Install system dependencies for building native modules and health checks
# Update packages to latest versions for security
RUN apk update && apk upgrade && apk add --no-cache \
    libc6-compat \
    wget \
    && rm -rf /var/cache/apk/*

# Copy package files first (for better Docker layer caching)
COPY package*.json ./

# Install dependencies with audit fix
RUN npm ci --only=production --audit-level=high && npm cache clean --force

# Copy the rest of the application source code
COPY . .

# Copy environment variables (you'll need to provide this during build)
# COPY .env.local .env.local

# Build the Next.js application
RUN npm run build

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set correct permissions for Next.js files
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the Next.js application
CMD ["npm", "start"]