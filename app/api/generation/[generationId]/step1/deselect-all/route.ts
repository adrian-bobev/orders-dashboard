import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function POST(
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

    // Deselect all images for this generation
    const { error } = await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', generationId)

    if (error) {
      console.error('Error deselecting all images:', error)
      return NextResponse.json({ error: 'Failed to deselect all images' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deselecting all images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to deselect all images' },
      { status: 500 }
    )
  }
}
