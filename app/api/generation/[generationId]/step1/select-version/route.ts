import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const { characterImageId } = await request.json()

    if (!characterImageId) {
      return NextResponse.json({ error: 'characterImageId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify the character image exists and belongs to this generation
    const { data: targetImage, error: findError } = await supabase
      .from('generation_character_images')
      .select('id')
      .eq('id', characterImageId)
      .eq('generation_id', generationId)
      .single()

    if (findError || !targetImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Deselect all images for this generation
    await supabase
      .from('generation_character_images')
      .update({ is_selected: false })
      .eq('generation_id', generationId)

    // Select this image
    const { error: updateError } = await supabase
      .from('generation_character_images')
      .update({ is_selected: true })
      .eq('id', targetImage.id)

    if (updateError) {
      console.error('Error selecting version:', updateError)
      return NextResponse.json({ error: 'Failed to select version' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error selecting character image version:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select version' },
      { status: 500 }
    )
  }
}
