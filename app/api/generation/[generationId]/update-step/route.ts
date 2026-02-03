import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

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

    return NextResponse.json({ generation: data })
  } catch (error) {
    console.error('Error updating generation step:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update generation step' },
      { status: 500 }
    )
  }
}
