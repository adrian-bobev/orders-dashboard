import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'
import { sendAllBooksReadyNotification } from '@/lib/services/telegram-service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const { currentStep, stepsCompleted } = await request.json()

    console.log('📝 Update step called:', { generationId, currentStep, stepsCompleted })

    const supabase = await createClient()

    // Check if step 5 is being marked as completed
    const isCompletingStep5 = stepsCompleted?.step5 === true
    console.log('📝 isCompletingStep5:', isCompletingStep5)

    const updateData: any = {
      current_step: currentStep,
      steps_completed: stepsCompleted,
    }

    // If step 5 is completed, mark the generation as completed
    if (isCompletingStep5) {
      updateData.status = 'completed'
      updateData.completed_at = new Date().toISOString()
      console.log('📝 Marking generation as completed')
    }

    const { data, error } = await supabase
      .from('book_generations')
      .update(updateData)
      .eq('id', generationId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update generation: ${error.message}`)
    }

    // If generation was marked as completed, check if all books in the order are ready
    if (isCompletingStep5) {
      console.log('📝 Checking if all books are ready...')
      await checkAndNotifyAllBooksReady(supabase, generationId)
    }

    return NextResponse.json({ generation: data })
  } catch (error) {
    console.error('Error updating generation step:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update generation step' },
      { status: 500 }
    )
  }
}

/**
 * Check if all book configurations in the order have completed generations
 * and send a Telegram notification if so
 */
async function checkAndNotifyAllBooksReady(supabase: any, generationId: string) {
  try {
    console.log('📝 checkAndNotifyAllBooksReady started for generation:', generationId)

    // Get the generation with its book_config
    const { data: generation, error: genError } = await supabase
      .from('book_generations')
      .select('book_config_id')
      .eq('id', generationId)
      .single()

    console.log('📝 Generation:', generation, 'Error:', genError)
    if (!generation) return

    // Get the book_config with line_item
    const { data: bookConfig, error: bcError } = await supabase
      .from('book_configurations')
      .select('line_item_id')
      .eq('id', generation.book_config_id)
      .single()

    console.log('📝 BookConfig:', bookConfig, 'Error:', bcError)
    if (!bookConfig) return

    // Get the line_item with order_id
    const { data: lineItem, error: liError } = await supabase
      .from('line_items')
      .select('order_id')
      .eq('id', bookConfig.line_item_id)
      .single()

    console.log('📝 LineItem:', lineItem, 'Error:', liError)
    if (!lineItem) return

    // Get the order with all its line_items and book_configurations
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        woocommerce_order_id,
        line_items!line_items_order_id_fkey (
          id,
          book_configurations!book_configurations_line_item_id_fkey (
            id,
            name
          )
        )
      `)
      .eq('id', lineItem.order_id)
      .single()

    console.log('📝 Order:', JSON.stringify(order, null, 2), 'Error:', orderError)
    if (!order) return

    // Get all book_config_ids for this order
    const allBookConfigIds: string[] = []
    const bookNames: string[] = []
    for (const li of order.line_items || []) {
      for (const bc of li.book_configurations || []) {
        allBookConfigIds.push(bc.id)
        bookNames.push(bc.name)
      }
    }

    console.log('📝 All book config IDs:', allBookConfigIds)
    console.log('📝 Book names:', bookNames)

    if (allBookConfigIds.length === 0) return

    // Check if all book configs have at least one completed generation
    const { data: completedGenerations, error: cgError } = await supabase
      .from('book_generations')
      .select('book_config_id')
      .in('book_config_id', allBookConfigIds)
      .eq('status', 'completed')

    console.log('📝 Completed generations:', completedGenerations, 'Error:', cgError)

    const completedBookConfigIds = new Set(
      (completedGenerations || []).map((g: any) => g.book_config_id)
    )

    console.log('📝 Completed book config IDs:', Array.from(completedBookConfigIds))

    // Check if all book configs have completed generations
    const allReady = allBookConfigIds.every((id) => completedBookConfigIds.has(id))

    console.log('📝 All ready:', allReady)

    if (allReady) {
      console.log('📝 Sending Telegram notification...')
      // Send Telegram notification
      await sendAllBooksReadyNotification({
        orderId: order.id,
        orderNumber: order.order_number || order.woocommerce_order_id?.toString() || 'Unknown',
        bookCount: allBookConfigIds.length,
        bookNames,
      })
    }
  } catch (error) {
    console.error('Error checking all books ready:', error)
    // Don't throw - this is a non-critical operation
  }
}
