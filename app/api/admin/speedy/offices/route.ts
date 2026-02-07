import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { fetchSpeedyOffices } from '@/lib/services/speedy-service'
import { getSpeedySettings, saveSpeedySettings } from '@/lib/services/settings-service'

/**
 * GET /api/admin/speedy/offices?cityId=123
 * Fetch all Speedy offices for a specific city
 * Used to populate the dropdown for selecting dropoff office
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { searchParams } = new URL(request.url)
    const cityIdParam = searchParams.get('cityId')

    if (!cityIdParam) {
      return NextResponse.json(
        { error: 'cityId query parameter is required' },
        { status: 400 }
      )
    }

    const cityId = parseInt(cityIdParam, 10)
    if (isNaN(cityId)) {
      return NextResponse.json(
        { error: 'cityId must be a valid number' },
        { status: 400 }
      )
    }

    const [offices, settings] = await Promise.all([
      fetchSpeedyOffices(cityId),
      getSpeedySettings(),
    ])

    return NextResponse.json({
      offices,
      currentSettings: settings,
    })
  } catch (error) {
    console.error('Error fetching Speedy offices:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Speedy offices',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/speedy/offices
 * Save the selected dropoff office and send mode
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const body = await request.json()
    const { sendFrom, dropoffOfficeId, dropoffCityId, dropoffCityName, senderName, senderPhone } = body

    // Validate sendFrom
    if (sendFrom && !['office', 'address'].includes(sendFrom)) {
      return NextResponse.json(
        { error: 'sendFrom must be "office" or "address"' },
        { status: 400 }
      )
    }

    // If sending from office, validate officeId
    if (sendFrom === 'office' && dropoffOfficeId && typeof dropoffOfficeId !== 'number') {
      return NextResponse.json(
        { error: 'dropoffOfficeId must be a number' },
        { status: 400 }
      )
    }

    await saveSpeedySettings({
      sendFrom: sendFrom || undefined,
      dropoffOfficeId: dropoffOfficeId || null,
      dropoffCityId: dropoffCityId || null,
      dropoffCityName: dropoffCityName || null,
      senderName: senderName || null,
      senderPhone: senderPhone || null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving Speedy settings:', error)
    return NextResponse.json(
      {
        error: 'Failed to save Speedy settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
