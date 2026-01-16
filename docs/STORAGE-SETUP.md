# Image Storage Setup - MinIO (Local) & R2 (Production)

This project uses MinIO for local development and Cloudflare R2 for production image storage.

## Architecture

### Local Development
- **MinIO**: S3-compatible object storage running in Docker
- Same API as S3/R2, so code works identically in dev and production
- Zero cloud billing, fast local access
- Web UI for browsing/uploading files

### Production
- **Cloudflare R2**: Production object storage
- S3-compatible API
- Low-cost, high-performance storage

## Quick Start

### 1. Start MinIO (Local Development)

```bash
# Start MinIO container
docker-compose up -d

# Verify it's running
docker ps | grep minio

# Access MinIO Console: http://localhost:9001
# Username: minioadmin
# Password: minioadmin123
```

The `docker-compose.yml` automatically:
- Creates the `images` bucket
- Sets up access credentials
- Exposes API on port 9000, Console on port 9001

### 2. Environment Configuration

**Local (.env.local)**
```bash
R2_BUCKET=images
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin123
```

**Production (.env.production)**
```bash
R2_BUCKET=images
R2_ENDPOINT=https://8ef5a0782101b3cba1df4d7595e11df5.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=8bb8d3cad70b5409360586a06ce00fcb
R2_SECRET_ACCESS_KEY=e2657b4d0e5464f4ec24791660677cd74cb3c6b9972f3c948f6fcf815715e68e
```

## Usage in Code

### Display an Image

```tsx
import { SmartImage } from '@/components/SmartImage';
import { getImageUrl } from '@/lib/r2-client';

function OrderCover({ imageKey }: { imageKey: string }) {
  const imageUrl = getImageUrl(imageKey);

  return (
    <SmartImage
      src={imageUrl}
      alt="Order cover"
      width={400}
      height={300}
    />
  );
}
```

### Upload an Image (Example)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getStorageClient } from '@/lib/r2-client';

async function uploadImage(file: File, key: string) {
  const client = getStorageClient();
  const bucket = process.env.R2_BUCKET;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: await file.arrayBuffer(),
    ContentType: file.type,
  });

  await client.send(command);
  return getImageUrl(key);
}
```

## MinIO Console UI

Access the MinIO web console at http://localhost:9001

- **Username**: minioadmin
- **Password**: minioadmin123

Features:
- Browse buckets and objects
- Upload/download files
- View object metadata
- Manage access policies

## Managing MinIO

### Start/Stop
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Stop and remove data
docker-compose down -v
```

### View Logs
```bash
docker-compose logs -f minio
```

### Upload Test Image
```bash
# Using MinIO Client (mc)
docker run --rm -v $(pwd):/data --network host minio/mc \
  cp /data/test-image.jpg local/images/test.jpg

# Or use the Console UI
```

## How Image Retrieval Works

1. **Request**: Browser requests `/api/images?key=orders/123/cover.jpg`
2. **API Route**: `/app/api/images/route.ts` receives the request
3. **Storage Client**: Uses `getStorageClient()` from `lib/r2-client.ts`
   - In local: Connects to MinIO at `http://localhost:9000`
   - In prod: Connects to R2 at your R2 endpoint
4. **Fetch**: S3 SDK fetches the object from storage
5. **Response**: Image bytes returned with proper Content-Type header

## SmartImage Component

The `SmartImage` component automatically handles:
- API proxy URLs (`/api/images?key=...`)
- Signed URLs (pre-signed S3/R2 URLs)
- Data URLs (`data:image/...`)
- Regular URLs

It bypasses Next.js Image optimization for API proxy URLs to avoid domain configuration issues.

## Production Deployment

### Getting R2 Credentials

1. Log in to Cloudflare Dashboard
2. Go to **R2 Object Storage**
3. Create a bucket named `images` (or your preferred name)
4. Go to **Manage R2 API Tokens**
5. Create a new API token with:
   - **Permissions**: Object Read & Write
   - **TTL**: Never expire
6. Copy the credentials:
   - Account ID (in endpoint URL)
   - Access Key ID
   - Secret Access Key
7. Set in `.env.production`

### Environment Variables

Update your production environment (Vercel, Railway, etc.) with:
```bash
R2_BUCKET=images
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<your-access-key-id>
R2_SECRET_ACCESS_KEY=<your-secret-access-key>
```

## Troubleshooting

### MinIO Container Won't Start
```bash
# Check logs
docker-compose logs minio

# Restart
docker-compose restart minio
```

### Connection Refused Error
- Ensure MinIO is running: `docker ps`
- Check `.env.local` has correct endpoint: `http://localhost:9000`
- Verify port 9000 is not in use: `lsof -i :9000`

### Bucket Not Found
```bash
# Manually create bucket
docker exec -it order-dashboard-minio-init sh
mc alias set local http://minio:9000 minioadmin minioadmin123
mc mb local/images
```

### Images Not Loading
1. Check MinIO is running
2. Verify environment variables are loaded
3. Check browser console for errors
4. Test API directly: `curl http://localhost:3000/api/images?key=test.jpg`

## Development Workflow

### Adding Images to MinIO

**Option 1: Console UI**
1. Go to http://localhost:9001
2. Login with minioadmin/minioadmin123
3. Click on `images` bucket
4. Upload files

**Option 2: mc Command**
```bash
# Alias setup (one time)
docker run --rm --network host minio/mc \
  alias set local http://localhost:9000 minioadmin minioadmin123

# Upload
docker run --rm -v $(pwd):/data --network host minio/mc \
  cp /data/image.jpg local/images/path/to/image.jpg
```

**Option 3: Code**
Use the upload example above in your application.

## Cost Comparison

### Local Development (MinIO)
- **Cost**: $0 (runs locally)
- **Speed**: Very fast (local network)
- **Data**: Stored in Docker volume

### Production (R2)
- **Storage**: ~$0.015/GB/month
- **Class B Operations** (reads): $0.36/million
- **Class A Operations** (writes): $4.50/million
- **Egress**: $0 (unlike S3!)

Example: 1000 orders with 5MB covers each
- Storage: 5GB × $0.015 = $0.075/month
- Reads: 10,000 views × $0.36/1M = ~$0.004
- **Total**: ~$0.08/month

## Migration from R2 to MinIO (or vice versa)

No code changes needed! Just update the environment variables:

**Switch from R2 to MinIO**
```bash
# In .env.local
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin123
```

**Switch from MinIO to R2**
```bash
# In .env.production
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
```

## Additional Resources

- [MinIO Documentation](https://min.io/docs/minio/container/index.html)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
