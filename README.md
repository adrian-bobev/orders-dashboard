# Order Dashboard

Role-based order management dashboard built with Next.js 15 and Supabase.

## Features

- 🔐 **Authentication**: Supabase Auth with email/password
- 👥 **User Management**: Admin can manage users and roles
- 🎨 **Bulgarian Localization**: Full Bulgarian language support
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🚀 **Server-Side Rendering**: Fast page loads with Next.js 15
- 💾 **PostgreSQL Database**: Reliable and scalable with Supabase
- 🔒 **Row Level Security**: Database-level authorization
- 📦 **WooCommerce Integration**: Webhook support for orders

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Styling**: Tailwind CSS 4
- **TypeScript**: Full type safety

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for local Supabase)
- Supabase CLI: `brew install supabase/tap/supabase`

### Local Development

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd order-dashboard-2
   npm install
   ```

2. **Start Supabase**:
   ```bash
   supabase start
   ```

   Note the API URL and keys from the output.

3. **Configure environment**:
   ```bash
   cp .env.local.example .env.local
   ```

   Update `.env.local` with the keys from `supabase start`.

4. **Apply migrations**:
   ```bash
   supabase db reset
   supabase gen types typescript --local > lib/database.types.ts
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

6. **Visit** `http://localhost:3000`

### First Time Setup

1. Sign up - first user becomes admin automatically
2. Sign in with your credentials
3. Access the dashboard
4. Admin can manage users at `/dashboard/admin/users`

## Project Structure

```
.
├── app/
│   ├── dashboard/           # Protected dashboard pages
│   │   ├── admin/users/    # User management (admin only)
│   │   └── page.tsx        # Dashboard home
│   ├── sign-in/            # Sign in page
│   ├── sign-up/            # Sign up page
│   └── api/webhooks/       # WooCommerce webhook
├── components/
│   ├── admin/              # Admin components
│   └── auth/               # Auth components
├── lib/
│   ├── services/           # Business logic
│   ├── supabase/           # Supabase clients
│   └── database.types.ts   # Auto-generated types
├── supabase/
│   └── migrations/         # Database migrations
├── ecosystem.config.js     # PM2 configuration
├── nginx.conf.example      # Nginx configuration
└── deploy.sh              # Deployment script
```

## Database Schema

### users table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (matches auth.users.id) |
| email | TEXT | User email |
| name | TEXT | User name (optional) |
| image_url | TEXT | Profile image URL (optional) |
| role | TEXT | User role: 'admin' or 'viewer' |
| is_active | BOOLEAN | Active status (soft delete) |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

## User Roles

- **Admin**: Full access, can manage users, change roles, activate/deactivate
- **Viewer**: Read-only access, cannot manage users

## Development

### Supabase Commands

```bash
# Start local Supabase
supabase start

# Stop local Supabase
supabase stop

# View logs
supabase logs

# Open Studio (database UI)
open http://localhost:54323

# Create new migration
supabase migration new migration_name

# Apply migrations
supabase db reset

# Generate types
supabase gen types typescript --local > lib/database.types.ts
```

### Next.js Commands

```bash
# Development
npm run dev

# Build
npm run build

# Start production
npm start

# Lint
npm run lint
```

## Deployment

### Deploy to VPS

1. Setup VPS (Ubuntu 22.04)
2. Install Node.js, PM2, Nginx
3. Clone repository to `/var/www/order-dashboard`
4. Configure `.env.local` with production credentials
5. Run `npm install && npm run build`
6. Start with PM2: `pm2 start ecosystem.config.js`
7. Configure Nginx with `nginx.conf.example`
8. Setup SSL with Let's Encrypt

For updates:
```bash
./deploy.sh
```

## Environment Variables

### Local Development
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-start>
```

### Production
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>
```

## WooCommerce Integration

The app supports WooCommerce webhooks for order processing.

1. Configure webhook in WooCommerce:
   - URL: `https://your-domain.com/api/webhooks/woocommerce`
   - Secret: (generate and add to `.env.local`)

2. Add environment variables:
   ```bash
   WOOCOMMERCE_STORE_URL=https://your-store.com
   WOOCOMMERCE_CONSUMER_KEY=ck_xxx
   WOOCOMMERCE_CONSUMER_SECRET=cs_xxx
   WOOCOMMERCE_WEBHOOK_SECRET=your-secret
   ```

## Security

- Row Level Security (RLS) enabled on all tables
- Server-side authentication checks
- Middleware protects routes
- Admin-only mutations verified at database level
- Soft delete prevents data loss

## Cost

- **Supabase Free Tier**: 500MB database, 100K MAU
- **VPS**: $5-10/month (Hetzner, DigitalOcean)
- **Total**: ~$5-10/month

## Troubleshooting

### Supabase won't start
```bash
supabase stop
docker container prune -f
supabase start
```

### Migration errors
```bash
supabase db reset
```

### Type errors
```bash
supabase gen types typescript --local > lib/database.types.ts
```

## License

MIT

## Support

For issues, check:
- Supabase Studio: `http://localhost:54323`
- Next.js logs: Terminal output
- Supabase logs: `supabase logs`
