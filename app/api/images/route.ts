import { NextRequest, NextResponse } from 'next/server';
import { fetchImageFromStorage } from '@/lib/r2-client';

export const runtime = 'nodejs';

/**
 * API route to fetch images from storage (MinIO in dev, R2 in production)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Missing image key parameter' },
        { status: 400 }
      );
    }

    const result = await fetchImageFromStorage(key);

    if (!result) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    const headers = new Headers();
    if (result.contentType) {
      headers.set('Content-Type', result.contentType);
    }
    headers.set('Cache-Control', 'private, max-age=300');

    return new Response(Buffer.from(result.body), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
