import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { AVAILABLE_PROVIDERS, DEFAULT_PROVIDER_CONFIG, DEFAULT_MODEL_PER_PROVIDER } from '@/lib/services/generation/step4-character-refs'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    return NextResponse.json({
      providers: AVAILABLE_PROVIDERS,
      defaultConfig: DEFAULT_PROVIDER_CONFIG,
      defaultModels: DEFAULT_MODEL_PER_PROVIDER,
    })
  } catch (error) {
    console.error('Error fetching providers:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch providers' },
      { status: 500 }
    )
  }
}
