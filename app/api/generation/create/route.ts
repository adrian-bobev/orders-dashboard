import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { generationService } from '@/lib/services/generation/generation-service'

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const currentUser = authResult

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const bookConfigId = searchParams.get('bookConfigId')
    const orderId = searchParams.get('orderId')

    if (!bookConfigId || !orderId) {
      return NextResponse.json(
        { error: 'Missing bookConfigId or orderId' },
        { status: 400 }
      )
    }

    // Create new generation
    const generation = await generationService.createGeneration(bookConfigId, currentUser.id)

    // Redirect to the new generation page
    const redirectUrl = `/orders/${orderId}/generate?bookConfigId=${bookConfigId}&generationId=${generation.id}`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
    return NextResponse.redirect(new URL(redirectUrl, baseUrl))
  } catch (error) {
    console.error('Error creating generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create generation' },
      { status: 500 }
    )
  }
}
