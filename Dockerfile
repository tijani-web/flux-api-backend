# Use Node.js 20 image
FROM node:20

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema before generating client
COPY prisma ./prisma
RUN npx prisma generate --schema=prisma/schema.prisma

# Copy the rest of your backend code
COPY . .

# Expose port 5001
EXPOSE 5001

# Start the backend
CMD ["node", "src/index.js"]

# Healthcheck using curl
HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:5001/api/execute/health || exit 1