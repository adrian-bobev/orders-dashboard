import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const supabase = await createClient()

    // Get total cost from book_generations
    const { data: generation } = await supabase
      .from('book_generations')
      .select('total_cost')
      .eq('id', generationId)
      .single()

    const totalCost = Number((generation as any)?.total_cost) || 0

    return NextResponse.json({ totalCost })
  } catch (error) {
    console.error('Error fetching costs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch costs' },
      { status: 500 }
    )
  }
}
