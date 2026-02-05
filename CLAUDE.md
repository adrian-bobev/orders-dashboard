# Claude Code Guidelines for Order Dashboard

## Project Overview
Order dashboard for managing WooCommerce orders with automated book generation (PDF and preview images).

## Development Environments

This project runs in three different environments. **Always verify changes work in all three:**

### 1. Local Development (`npm run dev`)
- Uses `.env.local` for environment variables
- Next.js runs directly on host machine
- Supabase runs locally via `npx supabase start`
- Worker runs separately via `npx tsx worker/index.ts`

### 2. Local Docker Production (`docker-compose.prod.yml`)
- Simulates production environment locally
- Uses `extra_hosts` to access host's Supabase (`localhost:host-gateway`)
- All services run in Docker containers
- Uses `.env` file for environment variables

### 3. Hostinger Production (`docker-compose.hostinger.yml`)
- Production deployment on Hostinger VPS
- Uses Supabase Cloud (no `extra_hosts` needed)
- Internal services (worker, pdf-create) not exposed externally
- Uses `.env` with production credentials

## Pre-Change Checklist

Before making changes that affect:

### Environment Variables
- [ ] Update `docker-compose.prod.yml` (app, worker, pdf-create sections)
- [ ] Update `docker-compose.hostinger.yml` (same sections)
- [ ] Update `.env.example` or `.env.production.example` if new variable

### Worker Code (`worker/` directory)
- [ ] Ensure `@/` path aliases work (uses `tsconfig.worker.json`)
- [ ] Test with `npx tsx --tsconfig tsconfig.worker.json worker/index.ts`
- [ ] Rebuild Docker: `docker compose -f docker-compose.prod.yml build worker`

### PDF Service (`packages/pdf-create/`)
- [ ] Test locally: `cd packages/pdf-create && node server.js`
- [ ] Rebuild Docker: `docker compose -f docker-compose.prod.yml build pdf-create`
- [ ] Note: Uses ImageMagick 6 (`convert` command, not `magick`)

### Next.js App
- [ ] Test with `npm run dev`
- [ ] Test TypeScript: `npx tsc --noEmit`
- [ ] Rebuild Docker: `docker compose -f docker-compose.prod.yml build app`

## Common Issues

### Auth not working in Docker
- Browser uses `NEXT_PUBLIC_SUPABASE_URL` (localhost:54321)
- Server must use the same URL for cookie validation
- Don't override `SUPABASE_URL` differently from public URL in local Docker

### Worker can't find modules
- Ensure `tsconfig.worker.json` has correct paths
- Dockerfile.worker must use: `npx tsx --tsconfig tsconfig.worker.json worker/index.ts`

### ImageMagick errors in pdf-create
- Use `convert` not `magick` (ImageMagick 6 syntax)
- PDF operations require policy update in Dockerfile

## Quick Commands

```bash
# Local development
npm run dev
npx tsx --tsconfig tsconfig.worker.json worker/index.ts

# Docker production (local)
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f worker

# Rebuild specific service
docker compose -f docker-compose.prod.yml up -d app --build
docker compose -f docker-compose.prod.yml up -d worker --build
docker compose -f docker-compose.prod.yml up -d pdf-create --build

# Wake worker to process jobs
curl -X POST http://localhost:4000/wake

# Check TypeScript
npx tsc --noEmit
```

## Docker Compose Files Sync

When updating environment variables or configuration, keep these files in sync:

| Setting | `docker-compose.prod.yml` | `docker-compose.hostinger.yml` |
|---------|---------------------------|--------------------------------|
| `extra_hosts` | Yes (localhost:host-gateway) | No |
| `SUPABASE_URL` override | No (removed) | No |
| Internal ports exposed | Yes (4000, 4001) | No (use `expose`) |
| Worker env vars | Must match | Must match |
