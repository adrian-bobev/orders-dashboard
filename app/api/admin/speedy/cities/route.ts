import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { searchSpeedyCities } from '@/lib/services/speedy-service'

/**
 * GET /api/admin/speedy/cities?q=София
 * Search for cities by name
 * Used for city autocomplete when selecting dropoff office location
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query parameter "q" must be at least 2 characters' },
        { status: 400 }
      )
    }

    const cities = await searchSpeedyCities(query)

    return NextResponse.json({ cities })
  } catch (error) {
    console.error('Error searching Speedy cities:', error)
    return NextResponse.json(
      {
        error: 'Failed to search cities',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
