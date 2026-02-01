import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step4Service, IMAGE_GENERATION_COST } from '@/lib/services/generation/step4-character-refs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    const costs = await step4Service.getStep4Costs(generationId)

    return NextResponse.json({
      ...costs,
      costPerImage: IMAGE_GENERATION_COST,
    })
  } catch (error) {
    console.error('Error fetching costs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch costs' },
      { status: 500 }
    )
  }
}
