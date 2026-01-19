import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-scene-prompts'
import { step2Service } from '@/lib/services/generation/step2-proofread'
import { generationService } from '@/lib/services/generation/generation-service'

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
    const body = await request.json()
    const { systemPrompt, userPrompt } = body

    if (!systemPrompt || !userPrompt) {
      return NextResponse.json(
        { error: 'systemPrompt and userPrompt are required' },
        { status: 400 }
      )
    }

    // Get generation with book configuration
    const generation = await generationService.getGenerationById(generationId)
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Get corrected content from Step 2
    const correctedContent = await step2Service.getCorrectedContent(generationId)
    if (!correctedContent) {
      return NextResponse.json(
        { error: 'Please complete Step 2 (proofreading) first' },
        { status: 400 }
      )
    }

    // Generate scene prompts with provided prompts
    const prompts = await step3Service.generateScenePrompts({
      generationId,
      correctedContent: correctedContent.corrected_content,
      mainCharacterName: generation.book_configurations.name,
      systemPrompt,
      userPrompt,
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

    const prompts = await step3Service.getScenePrompts(generationId)
    const entitiesCount = await step3Service.getExtractedEntitiesCount(generationId)

    return NextResponse.json({ prompts, entitiesCount })
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

    const prompt = await step3Service.updateScenePrompt(promptId, imagePrompt)

    return NextResponse.json({ prompt })
  } catch (error) {
    console.error('Error updating scene prompt:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update scene prompt' },
      { status: 500 }
    )
  }
}
