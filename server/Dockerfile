FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies deterministically from lockfile
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 5050

# Start server
CMD ["node", "index.js"]
