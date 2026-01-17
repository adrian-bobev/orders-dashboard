import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params
    const { currentStep, stepsCompleted } = await request.json()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('book_generations')
      .update({
        current_step: currentStep,
        steps_completed: stepsCompleted,
      })
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
