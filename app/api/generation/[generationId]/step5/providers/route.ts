import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import {
  AVAILABLE_PROVIDERS,
  DEFAULT_PROVIDER_CONFIG,
  IMAGE_GENERATION_COST,
} from '@/lib/services/generation/step5-scene-images'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    return NextResponse.json({
      providers: AVAILABLE_PROVIDERS,
      defaultConfig: DEFAULT_PROVIDER_CONFIG,
      cost: IMAGE_GENERATION_COST,
    })
  } catch (error) {
    console.error('Error fetching providers:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch providers' },
      { status: 500 }
    )
  }
}
