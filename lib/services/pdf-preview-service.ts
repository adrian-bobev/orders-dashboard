import { createClient } from '@/lib/supabase/server'
import { fetchImageFromStorage } from '@/lib/r2-client'
import JSZip from 'jszip'

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:4001'
const PDF_SERVICE_ACCESS_TOKEN = process.env.PDF_SERVICE_ACCESS_TOKEN

interface BookJson {
  title: string
  shortDescription: string
  motivationEnd: string
  scenes: Array<{
    sceneNumber: number
    sourceText_bg: string
  }>
}

interface PreviewResponse {
  ok: boolean
  workId: string
  poll: string
  download: string
  previewUrl: string
}

interface ProgressResponse {
  stage: string
  message: string
  percent: number
}

/**
 * Generate ZIP file for a generation (server-side version of download-zip.tsx logic)
 */
async function generateZipForGeneration(generationId: string): Promise<Buffer> {
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
    throw new Error(`Generation not found: ${genError?.message}`)
  }

  // Get corrected content (step 2) - this has the scene texts
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

  // Build book.json
  const content = correctedContent?.corrected_content as {
    title?: string
    shortDescription?: string
    motivationEnd?: string
    scenes?: Array<{ text: string }>
  } | null

  const scenes = (content?.scenes || []).map((scene, index) => ({
    sceneNumber: index + 1,
    sourceText_bg: scene.text || '',
  }))

  const bookJson: BookJson = {
    title: content?.title || '',
    shortDescription: content?.shortDescription || '',
    motivationEnd: content?.motivationEnd || '',
    scenes,
  }

  // Create ZIP
  const zip = new JSZip()
  const imagesFolder = zip.folder('images')

  if (!imagesFolder) {
    throw new Error('Failed to create images folder')
  }

  zip.file('book.json', JSON.stringify(bookJson, null, 2))

  // Download and add images
  const selectedImages = sceneImages || []
  console.log(`📄 Fetching ${selectedImages.length} images from R2...`)
  const fetchStart = Date.now()

  for (const img of selectedImages) {
    const imageKey = img.image_key
    if (!imageKey) continue

    try {
      // Fetch image directly from R2 storage
      const imgStart = Date.now()
      const imageData = await fetchImageFromStorage(imageKey)
      const imgDuration = Date.now() - imgStart

      if (!imageData) {
        console.warn(`Failed to fetch image ${imageKey}: not found in storage`)
        continue
      }

      const sceneType = img.generation_scene_prompts.scene_type
      const sceneNumber = img.generation_scene_prompts.scene_number
      const fileName = sceneType === 'cover' ? 'cover.jpg' : `scene_${sceneNumber}.jpg`
      const sizeMB = (imageData.body.length / 1024 / 1024).toFixed(2)
      console.log(`📄   ${fileName}: ${sizeMB}MB (fetched in ${imgDuration}ms)`)

      imagesFolder.file(fileName, imageData.body)
    } catch (e) {
      console.warn(`Failed to download image ${imageKey}:`, e)
    }
  }

  const fetchDuration = ((Date.now() - fetchStart) / 1000).toFixed(2)
  console.log(`📄 All images fetched in ${fetchDuration}s`)

  // Generate ZIP as buffer
  console.log(`📄 Compressing ZIP...`)
  const zipStart = Date.now()
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const zipDuration = ((Date.now() - zipStart) / 1000).toFixed(2)
  console.log(`📄 ZIP compressed in ${zipDuration}s`)

  return zipBuffer
}

/**
 * Get auth headers for PDF service requests
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (PDF_SERVICE_ACCESS_TOKEN) {
    headers['x-access-token'] = PDF_SERVICE_ACCESS_TOKEN
  }
  return headers
}

/**
 * Upload ZIP to PDF service and get preview
 */
async function uploadZipForPreview(zipBuffer: Buffer): Promise<PreviewResponse> {
  // Use undici for proper multipart form handling
  const { FormData } = await import('undici')

  // Create a Blob from the buffer - cast to avoid TypeScript issues with Buffer vs BlobPart
  const blob = new Blob([new Uint8Array(zipBuffer)] as BlobPart[], { type: 'application/zip' })
  const formData = new FormData()
  formData.append('archive', blob, 'book.zip')

  const response = await fetch(`${PDF_SERVICE_URL}/preview`, {
    method: 'POST',
    headers: getAuthHeaders(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: formData as any,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`PDF service error: ${response.status} ${text}`)
  }

  return response.json()
}

/**
 * Poll for preview progress
 */
async function pollProgress(workId: string): Promise<void> {
  const maxAttempts = 600 // 10 minutes max (large PDFs can take a while)
  const pollInterval = 1000 // 1 second

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${PDF_SERVICE_URL}/progress/${workId}`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Progress check failed: ${response.status}`)
    }

    const progress: ProgressResponse = await response.json()
    console.log(`📄 PDF preview progress: ${progress.stage} - ${progress.message} (${progress.percent}%)`)

    if (progress.stage === 'done') {
      return
    }

    if (progress.stage === 'error') {
      throw new Error(`PDF generation failed: ${progress.message}`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('PDF generation timed out')
}

/**
 * Download the preview PDF
 */
async function downloadPreviewPdf(workId: string): Promise<Buffer> {
  const response = await fetch(`${PDF_SERVICE_URL}/files/${workId}/book-preview.pdf`, {
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to download preview: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Generate a book preview PDF for a generation
 * Returns the PDF as a Buffer
 */
export async function generateBookPreview(generationId: string): Promise<Buffer> {
  console.log(`📄 Generating book preview for generation ${generationId}...`)

  // Step 1: Generate ZIP from generation data
  console.log('📄 Step 1: Generating ZIP file...')
  const zipBuffer = await generateZipForGeneration(generationId)
  console.log(`📄 ZIP generated: ${zipBuffer.length} bytes`)

  // Step 2: Upload ZIP to PDF service
  console.log('📄 Step 2: Uploading to PDF service...')
  const previewResponse = await uploadZipForPreview(zipBuffer)
  console.log(`📄 Work ID: ${previewResponse.workId}`)

  // Step 3: Poll for completion
  console.log('📄 Step 3: Waiting for PDF generation...')
  await pollProgress(previewResponse.workId)

  // Step 4: Download preview PDF
  console.log('📄 Step 4: Downloading preview PDF...')
  const pdfBuffer = await downloadPreviewPdf(previewResponse.workId)
  console.log(`📄 Preview PDF downloaded: ${pdfBuffer.length} bytes`)

  return pdfBuffer
}

/**
 * Generate previews for all completed generations in an order
 * Returns array of { bookName, pdfBuffer } objects
 */
export async function generateOrderPreviews(
  orderId: string
): Promise<Array<{ childName: string; storyName: string; pdfBuffer: Buffer }>> {
  const supabase = await createClient()

  // Get all completed generations for this order
  const { data: order } = await supabase
    .from('orders')
    .select(`
      line_items!line_items_order_id_fkey (
        id,
        product_name,
        book_configurations!book_configurations_line_item_id_fkey (
          id,
          name,
          content,
          book_generations!book_generations_book_config_id_fkey (
            id,
            status
          )
        )
      )
    `)
    .eq('id', orderId)
    .single()

  if (!order) {
    throw new Error('Order not found')
  }

  const previews: Array<{ childName: string; storyName: string; pdfBuffer: Buffer }> = []

  for (const lineItem of order.line_items || []) {
    for (const bookConfig of lineItem.book_configurations || []) {
      // Find completed generation
      const completedGen = bookConfig.book_generations?.find(
        (g: { status: string }) => g.status === 'completed'
      )

      if (!completedGen) continue

      try {
        console.log(`📄 Generating preview for book: ${bookConfig.name}`)
        const pdfBuffer = await generateBookPreview(completedGen.id)
        const content = bookConfig.content as { title?: string } | null

        previews.push({
          childName: bookConfig.name,
          storyName: content?.title || lineItem.product_name,
          pdfBuffer,
        })
      } catch (e) {
        console.error(`Failed to generate preview for ${bookConfig.name}:`, e)
        // Continue with other books even if one fails
      }
    }
  }

  return previews
}
