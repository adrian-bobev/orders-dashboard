import { createServiceRoleClient } from '@/lib/supabase/server'
import { fetchImageFromStorage } from '@/lib/r2-client'
import JSZip from 'jszip'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

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

interface GenerateResponse {
  ok: boolean
  workId: string
  poll: string
  download: string
}

interface ProgressResponse {
  stage: string
  message: string
  percent: number
}

interface BookInfo {
  childName: string
  storyName: string
  generationId: string
}

interface PrintResult {
  success: boolean
  orderId: string
  orderNumber: string
  wooOrderId: string
  books: Array<{
    childName: string
    storyName: string
    downloadPath: string
  }>
  error?: string
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
 * Generate ZIP file for a generation (same logic as pdf-preview-service)
 */
async function generateZipForGeneration(generationId: string): Promise<Buffer> {
  const supabase = createServiceRoleClient()

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
  console.log(`📄 [Print] Fetching ${selectedImages.length} images from R2...`)

  for (const img of selectedImages) {
    const imageKey = img.image_key
    if (!imageKey) continue

    try {
      const imageData = await fetchImageFromStorage(imageKey)

      if (!imageData) {
        console.warn(`[Print] Failed to fetch image ${imageKey}: not found in storage`)
        continue
      }

      const sceneType = img.generation_scene_prompts.scene_type
      const sceneNumber = img.generation_scene_prompts.scene_number
      let fileName: string
      if (sceneType === 'cover') {
        fileName = 'cover.jpg'
      } else if (sceneType === 'back_cover') {
        fileName = 'back.jpg'
      } else {
        fileName = `scene_${sceneNumber}.jpg`
      }

      imagesFolder.file(fileName, imageData.body)
    } catch (e) {
      console.warn(`[Print] Failed to download image ${imageKey}:`, e)
    }
  }

  // Generate ZIP as buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  return zipBuffer
}

/**
 * Upload ZIP to PDF service for print-ready PDF generation
 */
async function uploadZipForPrint(zipBuffer: Buffer): Promise<GenerateResponse> {
  const { FormData } = await import('undici')

  const blob = new Blob([new Uint8Array(zipBuffer)] as BlobPart[], { type: 'application/zip' })
  const formData = new FormData()
  formData.append('archive', blob, 'book.zip')

  const url = `${PDF_SERVICE_URL}/generate`

  const response = await fetch(url, {
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
 * Poll for generation progress
 */
async function pollProgress(workId: string): Promise<void> {
  const maxAttempts = 600 // 10 minutes max
  const pollInterval = 2000 // 2 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${PDF_SERVICE_URL}/progress/${workId}`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Progress check failed: ${response.status}`)
    }

    const progress: ProgressResponse = await response.json()
    console.log(`📄 [Print] Progress: ${progress.stage} - ${progress.message} (${progress.percent}%)`)

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
 * Download the generated book ZIP from PDF service
 */
async function downloadGeneratedBook(workId: string): Promise<Buffer> {
  const response = await fetch(`${PDF_SERVICE_URL}/download/${workId}`, {
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Generate print-ready PDF for a single generation and save to disk
 */
async function generateAndDownloadBook(
  generationId: string,
  outputDir: string,
  bookConfig: { name: string; configId: string }
): Promise<string> {
  console.log(`📄 [Print] Generating print-ready PDF for ${bookConfig.name}...`)

  // Step 1: Generate ZIP from generation data
  console.log('[Print] Step 1: Generating ZIP file...')
  const zipBuffer = await generateZipForGeneration(generationId)
  console.log(`[Print] ZIP generated: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`)

  // Step 2: Upload ZIP to PDF service
  console.log('[Print] Step 2: Uploading to PDF service...')
  const response = await uploadZipForPrint(zipBuffer)
  console.log(`[Print] Work ID: ${response.workId}`)

  // Step 3: Poll for completion
  console.log('[Print] Step 3: Waiting for PDF generation...')
  await pollProgress(response.workId)

  // Step 4: Download the generated book
  console.log('[Print] Step 4: Downloading generated book...')
  const bookData = await downloadGeneratedBook(response.workId)

  // Step 5: Save to disk
  const sanitizedName = bookConfig.name.replace(/[^a-zA-Z0-9а-яА-Я\s-]/g, '').replace(/\s+/g, '_')
  const filename = `book-${bookConfig.configId}-${sanitizedName}.zip`
  const filepath = path.join(outputDir, filename)

  await writeFile(filepath, bookData)
  console.log(`[Print] ✅ Book saved to: ${filepath} (${(bookData.length / 1024 / 1024).toFixed(2)} MB)`)

  return filepath
}

/**
 * Generate print-ready PDFs for all completed books in an order
 * Downloads the generated files to the specified directory
 */
export async function generateOrderForPrint(
  woocommerceOrderId: number,
  outputDir: string
): Promise<PrintResult> {
  const supabase = createServiceRoleClient()

  // Find order by WooCommerce ID
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, woocommerce_order_id')
    .eq('woocommerce_order_id', woocommerceOrderId)
    .single()

  if (orderError || !order) {
    return {
      success: false,
      orderId: '',
      orderNumber: '',
      wooOrderId: woocommerceOrderId.toString(),
      books: [],
      error: `Order not found: ${orderError?.message || 'No order with this WooCommerce ID'}`,
    }
  }

  // Get all completed generations for this order
  const { data: lineItems } = await supabase
    .from('line_items')
    .select(`
      id,
      product_name,
      book_configurations!book_configurations_line_item_id_fkey (
        id,
        name,
        config_id,
        content,
        book_generations!book_generations_book_config_id_fkey (
          id,
          status
        )
      )
    `)
    .eq('order_id', order.id)

  // Ensure output directory exists
  const orderNumber = order.order_number || woocommerceOrderId.toString()
  const orderDir = path.join(outputDir, `order-${orderNumber}`)
  await mkdir(orderDir, { recursive: true })

  const completedBooks: Array<{
    childName: string
    storyName: string
    downloadPath: string
  }> = []

  const errors: Array<{ bookName: string; error: unknown }> = []

  for (const lineItem of lineItems || []) {
    for (const bookConfig of lineItem.book_configurations || []) {
      // Find completed generation
      const completedGen = bookConfig.book_generations?.find(
        (g: { status: string }) => g.status === 'completed'
      )

      if (!completedGen) {
        console.log(`[Print] Skipping ${bookConfig.name}: no completed generation`)
        continue
      }

      try {
        const downloadPath = await generateAndDownloadBook(
          completedGen.id,
          orderDir,
          {
            name: bookConfig.name,
            configId: bookConfig.config_id?.toString() || bookConfig.id,
          }
        )

        // Extract story name from content
        const content = bookConfig.content as { title?: string } | null
        const storyName = content?.title || 'Unknown Story'

        completedBooks.push({
          childName: bookConfig.name,
          storyName,
          downloadPath,
        })
      } catch (e) {
        console.error(`[Print] Failed to generate book for ${bookConfig.name}:`, e)
        errors.push({ bookName: bookConfig.name, error: e })
      }
    }
  }

  // If any books failed, include error info in result
  if (errors.length > 0) {
    const failedBooks = errors.map(e => e.bookName).join(', ')
    return {
      success: completedBooks.length > 0,
      orderId: order.id,
      orderNumber,
      wooOrderId: woocommerceOrderId.toString(),
      books: completedBooks,
      error: `Failed to generate books for: ${failedBooks}`,
    }
  }

  return {
    success: completedBooks.length > 0,
    orderId: order.id,
    orderNumber,
    wooOrderId: woocommerceOrderId.toString(),
    books: completedBooks,
    error: completedBooks.length === 0 ? 'No completed books found for this order' : undefined,
  }
}
