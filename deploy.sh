#!/bin/bash

# Deployment script for Order Dashboard
# Run this on your VPS after initial setup

set -e  # Exit on error

echo "🚀 Deploying Order Dashboard..."

# Navigate to project directory
cd /var/www/order-dashboard

# Pull latest changes
echo "📥 Pulling latest changes from Git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false

# Build Next.js app
echo "🔨 Building Next.js application..."
npm run build

# Reload PM2 process
echo "♻️  Reloading PM2 process..."
pm2 reload ecosystem.config.js

# Show status
echo "✅ Deployment complete!"
pm2 status
pm2 logs order-dashboard --lines 20
