import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { fetchSpeedyProfiles } from '@/lib/services/speedy-service'
import { getSpeedySettings, saveSpeedySettings } from '@/lib/services/settings-service'

/**
 * GET /api/admin/speedy/profiles
 * Fetch all Speedy profiles/contracts associated with the account
 * Used to populate the admin settings dropdown for selecting client ID
 */
export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const [profiles, settings] = await Promise.all([
      fetchSpeedyProfiles(),
      getSpeedySettings(),
    ])

    return NextResponse.json({
      profiles,
      currentSettings: settings,
    })
  } catch (error) {
    console.error('Error fetching Speedy profiles:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Speedy profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/speedy/profiles
 * Save the selected Speedy profile (client ID)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const body = await request.json()
    const { clientId } = body

    if (!clientId || typeof clientId !== 'number') {
      return NextResponse.json(
        { error: 'clientId is required and must be a number' },
        { status: 400 }
      )
    }

    await saveSpeedySettings({ clientId })

    return NextResponse.json({ success: true, clientId })
  } catch (error) {
    console.error('Error saving Speedy profile:', error)
    return NextResponse.json(
      {
        error: 'Failed to save Speedy profile',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
