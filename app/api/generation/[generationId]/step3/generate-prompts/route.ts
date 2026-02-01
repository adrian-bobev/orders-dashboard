import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/user-service'
import { step3Service } from '@/lib/services/generation/step3-scene-prompts'
import { step2Service } from '@/lib/services/generation/step2-proofread'
import { generationService } from '@/lib/services/generation/generation-service'
import { step1Service } from '@/lib/services/generation/step1-character-image'
import { fetchImageFromStorage } from '@/lib/r2-client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const { generationId } = await params
    const body = await request.json()
    const { systemPrompt, userPrompt, additionalImages } = body

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

    // Build images array for the AI
    const images: Array<{ url: string; description?: string }> = []

    // Get main character image from Step 1
    const characterImages = await step1Service.getCharacterImages(generationId)
    const selectedCharacterImage = characterImages.find((img: any) => img.is_selected)

    if (selectedCharacterImage) {
      const imageKey = selectedCharacterImage.generated_image_key || selectedCharacterImage.cropped_image_key
      if (imageKey) {
        try {
          const imageData = await fetchImageFromStorage(imageKey)
          if (imageData) {
            const base64 = Buffer.from(imageData.body).toString('base64')
            const contentType = imageData.contentType || 'image/png'
            const imageSizeKB = Math.round(base64.length * 0.75 / 1024)
            console.log(`Main character image loaded: ${imageSizeKB}KB, type: ${contentType}`)

            images.push({
              url: `data:${contentType};base64,${base64}`,
              description: `Main character reference photo: ${generation.book_configurations.name}, ${generation.book_configurations.age} years old`,
            })
          }
        } catch (error) {
          console.error('Failed to fetch main character image:', error)
        }
      }
    }

    console.log(`Sending ${images.length} images to AI model`)

    // Add additional reference images from the request
    if (additionalImages && Array.isArray(additionalImages)) {
      for (const img of additionalImages) {
        if (img.url) {
          images.push({
            url: img.url,
            description: img.description || undefined,
          })
        }
      }
    }

    // Generate scene prompts with provided prompts and images
    const prompts = await step3Service.generateScenePrompts({
      generationId,
      correctedContent: correctedContent.corrected_content,
      mainCharacterName: generation.book_configurations.name,
      systemPrompt,
      userPrompt,
      images: images.length > 0 ? images : undefined,
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
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

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
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

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
