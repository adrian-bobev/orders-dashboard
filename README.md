# Order Dashboard - Next.js + Convex + Clerk RBAC

A production-ready Next.js application with role-based access control (RBAC) using Convex as the backend and Clerk for authentication.

## Features

- **Authentication**: Secure authentication via Clerk
- **Role-Based Access Control**: Admin and viewer roles with extensible design
- **Real-time Updates**: Instant UI updates using Convex subscriptions
- **Soft Delete**: User removal preserves data integrity
- **VPS & Serverless Ready**: Deploy to VPS or serverless platforms
- **Webhook Support**: Handle long-running operations (1-2+ minutes)
- **Type-Safe**: End-to-end TypeScript with auto-generated Convex types

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS
- **Backend**: Convex (real-time database + serverless functions)
- **Authentication**: Clerk
- **Language**: TypeScript

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- npm or yarn package manager
- A Clerk account (free tier available)
- A Convex account (free tier available)

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to the project directory
cd order-dashboard-2

# Install dependencies
npm install
```

### 2. Set Up Clerk

1. Go to [https://dashboard.clerk.com/](https://dashboard.clerk.com/)
2. Create a new application (or use an existing one)
3. Choose "Next.js" as your framework
4. Copy your API keys from the dashboard

5. **IMPORTANT: Create Convex JWT Template**:
   - Navigate to **Configure** → **JWT Templates**
   - Click **"New template"**
   - Select **"Convex"** from the list
   - Click **"Apply changes"**
   - Note the **Issuer** URL (e.g., `https://alive-mammoth-58.clerk.accounts.dev`)

### 3. Set Up Convex

1. Run Convex development server:

```bash
npx convex dev
```

2. Follow the prompts to:
   - Log in to Convex (or create an account)
   - Create a new project or select an existing one
3. The command will output your `CONVEX_URL` - copy this

### 4. Configure Environment Variables

Update `.env.local` with your actual keys:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx  # From Clerk Dashboard
CLERK_SECRET_KEY=sk_test_xxxxx                   # From Clerk Dashboard

# Convex Backend
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud  # From npx convex dev
CONVEX_DEPLOYMENT=dev:your-project-xxx                     # From npx convex dev
```

### 5. Configure Clerk Redirect URLs

In your Clerk Dashboard:

1. Go to **Configure** → **Paths**
2. Set the following paths:
   - **Sign-in URL**: `/sign-in`
   - **Sign-up URL**: `/sign-in`
   - **After sign-in URL**: `/dashboard`
   - **After sign-up URL**: `/dashboard`

### 6. Start the Development Server

In a new terminal (keep `npx convex dev` running):

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## First-Time Setup

1. **Create Admin User**: The first user to sign up automatically becomes an admin
2. **Create Test Users**: Sign up with additional email addresses to test viewer role
3. **Test Admin Functions**: Log in as admin and visit `/dashboard/admin/users`

## Project Structure

```
order-dashboard-2/
├── app/
│   ├── (auth)/                    # Auth pages (sign-in)
│   ├── (dashboard)/               # Protected dashboard pages
│   │   ├── admin/users/           # Admin user management
│   │   ├── layout.tsx             # Dashboard layout
│   │   └── page.tsx               # Dashboard home
│   ├── api/webhooks/              # Webhook endpoints (future)
│   ├── layout.tsx                 # Root layout with providers
│   └── page.tsx                   # Landing page (redirect)
├── components/
│   ├── providers/                 # Convex + Clerk providers
│   ├── admin/                     # Admin components
│   └── user-sync.tsx              # User sync component
├── convex/
│   ├── auth.config.ts             # Clerk authentication config
│   ├── schema.ts                  # Database schema
│   ├── users.ts                   # User management functions
│   ├── actions.ts                 # Long-running actions
│   └── lib/authorization.ts       # Auth helpers
├── .env.local                     # Local environment variables
└── .env.example                   # Environment template
```

## How It Works

### Authentication Flow

1. User visits the app → middleware checks authentication
2. If not authenticated → redirect to `/sign-in`
3. User signs in via Clerk → `UserSync` component syncs to Convex
4. First user gets `admin` role, subsequent users get `viewer` role
5. User is redirected to `/dashboard`

### Authorization Flow

1. User action triggers Convex mutation
2. Mutation calls `requireAuth()` or `requireAdmin()` helper
3. Helper validates JWT and checks user role in database
4. If authorized → perform action, else → throw error
5. Client receives result or error message

### Role-Based Access

- **Admin**: Can access all pages, manage users, change roles
- **Viewer**: Can access dashboard home only

## Deployment

### Option A: Deploy to VPS (Recommended for Webhooks)

VPS deployment is ideal if you need to handle long-running webhooks (1-2+ minutes).

**Requirements**:
- Node.js 18+
- Nginx (for reverse proxy)
- PM2 (for process management)

**Steps**:

1. **Deploy Convex to Production**:

```bash
npx convex deploy --prod
```

Copy the production `CONVEX_URL`.

2. **Build Next.js**:

```bash
npm run build
```

3. **Copy Files to VPS**:

```bash
rsync -avz --exclude 'node_modules' ./ user@your-vps:/var/www/app/
```

4. **On VPS - Install and Start**:

```bash
cd /var/www/app
npm ci --production
pm2 start npm --name "order-dashboard" -- start
pm2 save
pm2 startup
```

5. **Configure Nginx**:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # For long-running webhooks
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

6. **Set Production Environment Variables**:

Create `/var/www/app/.env.production`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
CLERK_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
NODE_ENV=production
```

7. **Update Clerk for Production**:

In Clerk Dashboard:
- Switch to production environment (or create new production app)
- Update redirect URLs to your production domain
- Copy production API keys

### Option B: Deploy to Vercel (Simpler, But Limited for Webhooks)

1. **Deploy Convex**:

```bash
npx convex deploy --prod
```

2. **Deploy to Vercel**:

```bash
npm install -g vercel
vercel
```

3. **Set Environment Variables in Vercel Dashboard**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CONVEX_URL`

4. **Update Clerk URLs** to match your Vercel domain

**Note**: Vercel has timeout limits (10-900s depending on plan). For 1-2 minute webhooks, use the async pattern with Convex actions or deploy to VPS.

## Adding Webhook Support

To add webhook endpoints that handle long-running operations:

### 1. Create Webhook Route

Create `app/api/webhooks/your-webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  const payload = await request.json();

  // Validate webhook signature here

  // Schedule async processing
  await convex.action(api.actions.processLongRunningTask, {
    taskId: payload.id,
    data: payload
  });

  return NextResponse.json({ success: true });
}
```

### 2. Implement Processing Logic

Update `convex/actions.ts` with your business logic.

### 3. Monitor Status

Use Convex queries to track processing status and display real-time updates in your UI.

## Extending the Application

### Adding New Roles

1. Update `convex/schema.ts`:

```typescript
role: v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer"))
```

2. Run `npx convex dev` to regenerate types

3. Add authorization helpers in `convex/lib/authorization.ts`

4. Update UI to support new role

### Adding New Features

The architecture supports easy feature additions:

- Create new Convex functions for backend logic
- Add new pages under `app/(dashboard)/`
- Implement role-based access using authorization helpers
- Use Convex subscriptions for real-time updates

## Troubleshooting

### "Not authenticated" errors

- Ensure Clerk keys are correct in `.env.local`
- Check that `CLERK_JWT_ISSUER_DOMAIN` is not needed (it's optional)
- Verify user is signed in via Clerk

### "User not found in database" errors

- The `UserSync` component might not have run yet
- Try refreshing the page after sign-in
- Check Convex dashboard to see if user was created

### Convex functions not working

- Ensure `npx convex dev` is running
- Check that `NEXT_PUBLIC_CONVEX_URL` is correct
- Look for errors in the Convex dev terminal

### Build errors

- Run `npx convex dev` first to generate types
- Ensure all environment variables are set
- Try deleting `.next` folder and rebuilding

## Testing

### Test Checklist

- [ ] Sign up as first user (should be admin)
- [ ] Sign up as second user (should be viewer)
- [ ] Admin can access `/dashboard/admin/users`
- [ ] Admin can change user roles
- [ ] Admin can remove users
- [ ] Viewer cannot access admin pages
- [ ] Removed users cannot sign in
- [ ] Real-time updates work (open admin page in two tabs)

## Security Notes

- All authorization is enforced on the backend (Convex functions)
- Never trust client-side role checks
- Inactive users are blocked at the database level
- Clerk JWT tokens are automatically validated by Convex
- Role changes are logged in Convex dashboard

## License

MIT

## Support

For issues or questions:
- Check the [Convex documentation](https://docs.convex.dev/)
- Check the [Clerk documentation](https://clerk.com/docs)
- Review the [Next.js documentation](https://nextjs.org/docs)

---

Built with Next.js, Convex, and Clerk
