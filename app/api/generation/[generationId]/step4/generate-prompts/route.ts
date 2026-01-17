import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step4Service } from '@/lib/services/generation/step4-scene-prompts'
import { step2Service } from '@/lib/services/generation/step2-proofread'

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

    // Get corrected content from Step 2
    const correctedContent = await step2Service.getCorrectedContent(generationId)
    if (!correctedContent) {
      return NextResponse.json(
        { error: 'Please complete Step 2 (proofreading) first' },
        { status: 400 }
      )
    }

    // Generate scene prompts
    const prompts = await step4Service.generateScenePrompts({
      generationId,
      correctedContent: correctedContent.corrected_content,
    })

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('Error generating scene prompts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate scene prompts' },
      { status: 500 }
    )
  }
}

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

    const prompts = await step4Service.getScenePrompts(generationId)

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('Error fetching scene prompts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch scene prompts' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { promptId, imagePrompt } = await request.json()

    if (!promptId || !imagePrompt) {
      return NextResponse.json(
        { error: 'promptId and imagePrompt are required' },
        { status: 400 }
      )
    }

    const prompt = await step4Service.updateScenePrompt(promptId, imagePrompt)

    return NextResponse.json({ prompt })
  } catch (error) {
    console.error('Error updating scene prompt:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update scene prompt' },
      { status: 500 }
    )
  }
}
