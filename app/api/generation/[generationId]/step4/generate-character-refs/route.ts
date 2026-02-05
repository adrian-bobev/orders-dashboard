import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step4Service, AVAILABLE_PROVIDERS, type ProviderConfig } from '@/lib/services/generation/step4-character-refs'
import { getOrderInfoFromGeneration } from '@/lib/services/generation/generation-service'
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

    // Parse provider config from request
    const providerConfig: ProviderConfig | undefined = body.providerConfig

    // Check if generating all or single character
    if (body.characterListId) {
      // Generate single character reference
      const ref = await step4Service.generateCharacterReference({
        generationId,
        characterListId: body.characterListId,
        characterName: body.characterName,
        characterType: body.characterType,
        description: body.description,
        customPrompt: body.customPrompt,
        bookConfig: body.bookConfig,
        providerConfig,
      })

      return NextResponse.json({ reference: ref })
    } else {
      // Generate all character references
      const refs = await step4Service.generateAllCharacterReferences(
        generationId,
        body.bookConfig,
        body.customPrompts,
        providerConfig
      )

      return NextResponse.json({ references: refs })
    }
  } catch (error) {
    console.error('Error generating character references:', error)

    // Send Telegram error notification
    const orderInfo = await getOrderInfoFromGeneration(generationId)
    if (orderInfo) {
      await sendErrorNotification({
        orderId: orderInfo.orderId,
        orderNumber: orderInfo.orderNumber,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        context: `Step 4 (Character References) - ${orderInfo.bookName}`,
      })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate character references' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params

    const references = await step4Service.getCharacterReferences(generationId)

    return NextResponse.json({ references })
  } catch (error) {
    console.error('Error fetching character references:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch character references' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { characterListId, referenceId } = await request.json()

    if (!characterListId || !referenceId) {
      return NextResponse.json(
        { error: 'characterListId and referenceId are required' },
        { status: 400 }
      )
    }

    await step4Service.selectVersion(characterListId, referenceId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error selecting character reference version:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select version' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { searchParams } = new URL(request.url)
    const referenceId = searchParams.get('referenceId')

    if (!referenceId) {
      return NextResponse.json({ error: 'referenceId is required' }, { status: 400 })
    }

    await step4Service.deleteCharacterReference(referenceId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting character reference:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete character reference' },
      { status: 500 }
    )
  }
}
