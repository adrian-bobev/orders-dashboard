#!/bin/bash
# Deployment script for Hostinger VPS (Docker-based)
# Run this on your VPS after cloning the repository

set -e

echo "🚀 Starting deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "   Please copy .env.production.example to .env and fill in your values"
    exit 1
fi

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker installed. Please log out and back in, then run this script again."
    exit 0
fi

# Check Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

# Stop existing containers (if any)
echo "🛑 Stopping existing containers..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

# Pull latest changes (if this is an update)
if [ -d .git ]; then
    echo "📥 Pulling latest changes..."
    git pull origin main
fi

# Build and start containers
echo "🔨 Building containers..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting containers..."
docker compose -f docker-compose.prod.yml up -d

# Wait for health checks
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Check status
echo "📊 Container status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Configure your reverse proxy (nginx) to point to port 3000"
echo "   2. Set up SSL with Let's Encrypt"
echo "   3. Configure WooCommerce webhook to point to https://your-domain.com/api/webhooks/woocommerce"
echo ""
echo "📋 Useful commands:"
echo "   docker compose -f docker-compose.prod.yml logs -f        # View logs"
echo "   docker compose -f docker-compose.prod.yml ps             # Check status"
echo "   docker compose -f docker-compose.prod.yml restart        # Restart all"
echo "   docker compose -f docker-compose.prod.yml down           # Stop all"
