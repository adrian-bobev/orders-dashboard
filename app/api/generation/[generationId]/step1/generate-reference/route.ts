import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step1Service, type ProviderConfig } from '@/lib/services/generation/step1-character-image'
import { generationService, getOrderInfoFromGeneration } from '@/lib/services/generation/generation-service'
import { sendErrorNotification } from '@/lib/services/telegram-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  const { generationId } = await params

  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const body = await request.json()
    const { imageKeys, customPrompt, providerConfig } = body

    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return NextResponse.json(
        { error: 'At least one image must be selected' },
        { status: 400 }
      )
    }

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Generate the reference character with multiple images
    const result = await step1Service.generateReferenceCharacter(
      generationId,
      generation.book_configurations,
      imageKeys,
      customPrompt,
      providerConfig as ProviderConfig | undefined
    )

    return NextResponse.json({
      success: true,
      referenceKey: result.referenceKey,
      imageCount: result.imageCount,
      provider: result.provider,
      quality: result.quality,
      generationCost: result.generationCost,
    })
  } catch (error) {
    console.error('Error generating reference character:', error)

    // Send Telegram error notification
    const orderInfo = await getOrderInfoFromGeneration(generationId)
    if (orderInfo) {
      await sendErrorNotification({
        orderId: orderInfo.orderId,
        orderNumber: orderInfo.orderNumber,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        context: `Step 1 (Character Reference) - ${orderInfo.bookName}`,
      })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate reference character' },
      { status: 500 }
    )
  }
}
