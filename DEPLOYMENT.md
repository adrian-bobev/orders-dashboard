# Deployment Guide - Order Dashboard

This guide covers deploying the Order Dashboard with Docker on a VPS (Hostinger or similar).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Next.js App   │   PDF Service   │         Worker              │
│   (port 3000)   │   (port 4001)   │   (polls jobs table)        │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                      External Services                           │
│  Supabase │ Cloudflare R2 │ WooCommerce │ Telegram │ Resend     │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### VPS Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 2GB | 4GB |
| Storage | 20GB | 40GB |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 |

### External Services

- **Supabase** - Database (run the SQL migration first)
- **Cloudflare R2** - Object storage for images
- **WooCommerce** - E-commerce platform with webhook configured
- **Telegram Bot** - For notifications
- **Resend** - For customer emails

---

## Step 1: VPS Initial Setup

SSH into your VPS and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y

# Log out and back in for Docker group to take effect
exit
```

---

## Step 2: Clone Repository

```bash
# Create directory
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www

# Clone repository
git clone https://github.com/your-username/order-dashboard-2.git
cd order-dashboard-2
```

---

## Step 3: Configure Environment

```bash
# Copy environment template
cp .env.production.example .env

# Edit with your values
nano .env
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `WOOCOMMERCE_STORE_URL` | Your WooCommerce store URL |
| `WOOCOMMERCE_CONSUMER_KEY` | WooCommerce API consumer key |
| `WOOCOMMERCE_CONSUMER_SECRET` | WooCommerce API consumer secret |
| `WOOCOMMERCE_WEBHOOK_SECRET` | Secret for webhook verification |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID for notifications |
| `RESEND_API_KEY` | Resend API key for emails |
| `NEXT_PUBLIC_APP_URL` | Your production domain (https://...) |

---

## Step 4: Run Database Migration

Before deploying, ensure the jobs table exists in Supabase:

1. Go to Supabase Dashboard → SQL Editor
2. Run the contents of `supabase/migrations/20240204000000_create_jobs_table.sql`

Or if using Supabase CLI:
```bash
supabase db push
```

---

## Step 5: Deploy with Docker

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

This will:
1. Build all Docker images
2. Start containers with health checks
3. Configure auto-restart on failure

### Verify Deployment

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Test health endpoint
curl http://localhost:3000/api/health
```

---

## Step 6: Configure Nginx

```bash
# Copy nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/order-dashboard

# Edit and replace your-domain.com
sudo nano /etc/nginx/sites-available/order-dashboard

# Enable site
sudo ln -s /etc/nginx/sites-available/order-dashboard /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## Step 7: Setup SSL

```bash
# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

---

## Step 8: Configure WooCommerce Webhook

In WooCommerce admin panel:

1. Go to **Settings → Advanced → Webhooks**
2. Click **Add webhook**
3. Configure:
   - **Name**: Order Dashboard
   - **Status**: Active
   - **Topic**: Order updated
   - **Delivery URL**: `https://your-domain.com/api/webhooks/woocommerce`
   - **Secret**: Same as `WOOCOMMERCE_WEBHOOK_SECRET` in your `.env`
4. Save webhook

---

## Maintenance Commands

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f pdf-create
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart worker
```

### Update Deployment

```bash
cd /var/www/order-dashboard-2
git pull origin main
./deploy.sh
```

### Check Resource Usage

```bash
docker stats
```

---

## Job Queue Management

### View Jobs

Access the admin dashboard at: `https://your-domain.com/dashboard/admin/jobs`

### Manual Job Operations

```sql
-- View pending jobs
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at DESC;

-- View failed jobs
SELECT * FROM jobs WHERE status = 'failed' ORDER BY created_at DESC;

-- Manually retry a failed job (creates new job with same payload)
INSERT INTO jobs (type, payload, priority)
SELECT type, payload, priority FROM jobs WHERE id = 'failed-job-id';
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs app

# Check if port is in use
sudo lsof -i :3000
```

### Worker not processing jobs

1. Check worker logs: `docker compose -f docker-compose.prod.yml logs worker`
2. Verify Supabase connection in `.env`
3. Check if jobs table exists in Supabase
4. Verify PDF service is healthy

### PDF generation fails

1. Check PDF service logs: `docker compose -f docker-compose.prod.yml logs pdf-create`
2. Verify R2 credentials in `.env`
3. Check memory limits (PDF service needs ~2GB)

### Webhook not receiving

1. Verify webhook URL is accessible from internet
2. Check nginx configuration
3. Verify SSL certificate is valid
4. Check WooCommerce webhook secret matches `.env`

---

## Scaling (Future)

To handle more load, add additional workers:

```yaml
# In docker-compose.prod.yml, add:
worker-2:
  build:
    context: .
    dockerfile: Dockerfile.worker
  environment:
    - WORKER_ID=worker-2
    # ... same env vars as worker
```

The job queue uses row-level locking, so multiple workers can safely process jobs without duplicates.
