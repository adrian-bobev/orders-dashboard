import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step1Service, IMAGE_GENERATION_COSTS } from '@/lib/services/generation/step1-character-image'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    const costs = await step1Service.getStep1Costs(generationId)

    return NextResponse.json({
      ...costs,
      costs: IMAGE_GENERATION_COSTS,
    })
  } catch (error) {
    console.error('Error fetching costs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch costs' },
      { status: 500 }
    )
  }
}
