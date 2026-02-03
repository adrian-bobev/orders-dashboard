import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * GET /api/generation/[generationId]/export
 * Returns data needed for exporting a generation as a ZIP file
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ generationId: string }> }
) {
  try {
    const { generationId } = await context.params
    const supabase = await createClient()

    // Get the generation with book config
    const { data: generation, error: genError } = await supabase
      .from('book_generations')
      .select(`
        id,
        book_configurations!inner (
          id,
          name,
          config_id,
          line_item_id
        )
      `)
      .eq('id', generationId)
      .single()

    if (genError || !generation) {
      return NextResponse.json(
        { error: 'Generation not found' },
        { status: 404 }
      )
    }

    // Get line item for order info
    const { data: lineItem } = await supabase
      .from('line_items')
      .select('order_id')
      .eq('id', generation.book_configurations.line_item_id)
      .single()

    // Get order info
    let orderNumber = 'unknown'
    if (lineItem?.order_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('order_number, woocommerce_order_id')
        .eq('id', lineItem.order_id)
        .single()
      orderNumber = String(order?.order_number || order?.woocommerce_order_id || 'unknown')
    }

    // Get corrected content (step 2) - single source of truth for scene texts
    const { data: correctedContent } = await supabase
      .from('generation_corrected_content')
      .select('corrected_content')
      .eq('generation_id', generationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get scene images (step 5) - only selected ones
    const { data: sceneImages } = await supabase
      .from('generation_scene_images')
      .select(`
        image_key,
        is_selected,
        generation_scene_prompts!inner (
          id,
          scene_number,
          scene_type
        )
      `)
      .eq('generation_id', generationId)
      .eq('is_selected', true)

    return NextResponse.json({
      bookConfig: {
        name: generation.book_configurations.name,
        configId: generation.book_configurations.config_id,
      },
      orderInfo: {
        orderNumber,
      },
      correctedContent: correctedContent || null,
      sceneImages: sceneImages || [],
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
