import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params
    const supabase = await createClient()

    const { data: entities, error } = await supabase
      .from('generation_character_list')
      .select('*')
      .eq('generation_id', generationId)
      .eq('is_main_character', false)
      .order('character_type', { ascending: true })
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching entities:', error)
      return NextResponse.json(
        { error: 'Failed to fetch entities' },
        { status: 500 }
      )
    }

    return NextResponse.json({ entities: entities || [] })
  } catch (error) {
    console.error('Error in entities GET:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch entities' },
      { status: 500 }
    )
  }
}
