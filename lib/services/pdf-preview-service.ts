import { createServiceRoleClient } from '@/lib/supabase/server'
import { fetchImageFromStorage } from '@/lib/r2-client'
import JSZip from 'jszip'
import { createLogger, type LogContext } from '@/lib/utils/logger'
import { checkCancellation, promiseAllWithSignal } from '@/lib/utils/cancellation'
import { cleanupPDFServiceJob } from '@/lib/services/pdf-service-client'

const logger = createLogger('PreviewService')
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

interface PreviewImagesResponse {
  ok: boolean
  workId: string
  poll: string
  r2Folder: string
}

interface ProgressResponse {
  stage: string
  message: string
  percent: number
}

/**
 * Generate ZIP file for a generation (server-side version of download-zip.tsx logic)
 */
async function generateZipForGeneration(
  generationId: string,
  context?: LogContext,
  signal?: AbortSignal
): Promise<Buffer> {
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

  // Download and add images in parallel
  const selectedImages = sceneImages || []
  logger.info(`Fetching ${selectedImages.length} images from R2 (parallel)...`, undefined, context)
  const fetchStart = Date.now()

  // Fetch all images in parallel with signal support
  const fetchPromises = selectedImages
    .filter((img) => img.image_key)
    .map(async (img) => {
      const imageKey = img.image_key!
      const imgStart = Date.now()
      try {
        const imageData = await fetchImageFromStorage(imageKey)
        const imgDuration = Date.now() - imgStart
        return { img, imageData, imgDuration, error: null }
      } catch (e) {
        return { img, imageData: null, imgDuration: 0, error: e }
      }
    })

  const results = await promiseAllWithSignal(fetchPromises, signal, context)

  // Process results and add to ZIP
  for (const { img, imageData, imgDuration, error } of results) {
    if (error) {
      logger.warn(`Failed to download image ${img.image_key}`, { error }, context)
      continue
    }

    if (!imageData) {
      logger.warn(`Failed to fetch image ${img.image_key}: not found in storage`, undefined, context)
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
    const sizeMB = (imageData.body.length / 1024 / 1024).toFixed(2)
    logger.debug(`${fileName}: ${sizeMB}MB (fetched in ${imgDuration}ms)`, undefined, context)

    imagesFolder.file(fileName, imageData.body)
  }

  const fetchDuration = ((Date.now() - fetchStart) / 1000).toFixed(2)
  logger.info(`All images fetched in ${fetchDuration}s (parallel)`, undefined, context)

  // Generate ZIP as buffer
  logger.debug('Compressing ZIP...', undefined, context)
  const zipStart = Date.now()
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const zipDuration = ((Date.now() - zipStart) / 1000).toFixed(2)
  logger.debug(`ZIP compressed in ${zipDuration}s`, undefined, context)

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
 * Upload ZIP to PDF service for preview image generation
 */
async function uploadZipForPreviewImages(
  zipBuffer: Buffer,
  orderId: string,
  bookConfigId: string,
  signal?: AbortSignal,
  skipWatermark?: boolean
): Promise<PreviewImagesResponse> {
  const { FormData } = await import('undici')

  const blob = new Blob([new Uint8Array(zipBuffer)] as BlobPart[], { type: 'application/zip' })
  const formData = new FormData()
  formData.append('archive', blob, 'book.zip')

  let url = `${PDF_SERVICE_URL}/preview-images?orderId=${encodeURIComponent(orderId)}&bookConfigId=${encodeURIComponent(bookConfigId)}`
  if (skipWatermark) {
    url += '&skipWatermark=true'
  }

  console.log(`[PreviewService] Uploading ZIP to: ${url} (skipWatermark=${skipWatermark})`)

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: formData as any,
    signal,
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
async function pollProgress(workId: string, signal?: AbortSignal): Promise<void> {
  const maxAttempts = 120 // 10 minutes max
  const pollInterval = 5000 // 5 seconds - less intensive polling

  for (let i = 0; i < maxAttempts; i++) {
    // Check if aborted before each poll
    if (signal?.aborted) {
      throw new Error('Operation cancelled')
    }

    const response = await fetch(`${PDF_SERVICE_URL}/progress/${workId}`, {
      headers: getAuthHeaders(),
      signal,
    })
    if (!response.ok) {
      throw new Error(`Progress check failed: ${response.status}`)
    }

    const progress: ProgressResponse = await response.json()
    logger.debug(`Preview images progress: ${progress.stage} - ${progress.message} (${progress.percent}%)`)

    if (progress.stage === 'done') {
      return
    }

    if (progress.stage === 'error') {
      throw new Error(`Preview generation failed: ${progress.message}`)
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, pollInterval)
      signal?.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new Error('Operation cancelled'))
      }, { once: true })
    })
  }

  throw new Error('Preview generation timed out')
}

/**
 * Generate preview images for a generation and upload to R2
 * Returns the R2 folder path where images were uploaded
 */
export async function generatePreviewImages(
  generationId: string,
  orderId: string,
  bookConfigId: string,
  signal?: AbortSignal,
  skipWatermark?: boolean
): Promise<string> {
  const context: LogContext = {
    generationId,
    bookConfigId,
    phase: 'preview-images',
  }

  logger.info(`Generating preview images for generation ${generationId}...`, { skipWatermark }, context)
  checkCancellation(signal, context)

  let workId: string | undefined;

  try {
    // Step 1: Generate ZIP from generation data
    logger.info('Step 1: Generating ZIP file...', undefined, context)
    checkCancellation(signal, context)
    const zipBuffer = await generateZipForGeneration(generationId, context, signal)
    logger.info(`ZIP generated: ${zipBuffer.length} bytes`, undefined, context)

    // Step 2: Upload ZIP to PDF service for preview image generation
    logger.info('Step 2: Uploading to PDF service for preview images...', undefined, context)
    checkCancellation(signal, context)
    const response = await uploadZipForPreviewImages(zipBuffer, orderId, bookConfigId, signal, skipWatermark)
    workId = response.workId; // Store for cleanup
    logger.info(`Work ID: ${response.workId}, R2 Folder: ${response.r2Folder}`, undefined, context)

    // Step 3: Poll for completion
    logger.info('Step 3: Waiting for preview image generation...', undefined, context)
    checkCancellation(signal, context)
    await pollProgress(response.workId, signal)

    logger.info(`Preview images uploaded to R2: ${response.r2Folder}`, undefined, context)

    // Step 4: Cleanup PDF service files
    logger.info('Step 4: Cleaning up PDF service files...', undefined, context)
    const cleanupResult = await cleanupPDFServiceJob(response.workId)

    if (!cleanupResult.ok) {
      logger.warn('PDF service cleanup failed (non-critical)', {
        workId: response.workId,
        error: cleanupResult.error
      }, context)
    }

    return response.r2Folder
  } catch (error) {
    // Cleanup on error/cancellation
    if (workId) {
      logger.info('Cleaning up after error/cancellation...', undefined, context)
      await cleanupPDFServiceJob(workId)
    }
    throw error
  }
}

/**
 * Options for preview generation
 */
export interface PreviewGenerationOptions {
  signal?: AbortSignal // for cancellation support
  skipWatermark?: boolean // skip watermark for final review
}

/**
 * Generate preview images for all completed generations in an order
 * Uploads watermarked images to R2 bucket (unless skipWatermark is true)
 * Uses WooCommerce order ID and book config_id for R2 folder structure
 */
export async function generateOrderPreviews(
  orderId: string,
  options?: PreviewGenerationOptions
): Promise<void> {
  const signal = options?.signal
  const skipWatermark = options?.skipWatermark
  const supabase = createServiceRoleClient()

  // Get all completed generations for this order
  const { data: order } = await supabase
    .from('orders')
    .select(`
      woocommerce_order_id,
      line_items!line_items_order_id_fkey (
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
      )
    `)
    .eq('id', orderId)
    .single()

  if (!order) {
    throw new Error('Order not found')
  }

  if (!order.woocommerce_order_id) {
    throw new Error('Order has no WooCommerce order ID')
  }

  const wooOrderId = order.woocommerce_order_id.toString()
  const errors: Array<{ bookName: string; error: unknown }> = []

  for (const lineItem of order.line_items || []) {
    for (const bookConfig of lineItem.book_configurations || []) {
      // Context for this book
      const bookContext: LogContext = {
        wooOrderId: order.woocommerce_order_id,
        bookConfigId: bookConfig.id,
        phase: 'preview-book-gen',
      }

      // Check if aborted before processing each book
      checkCancellation(signal, bookContext)

      // Find completed generation
      const completedGen = bookConfig.book_generations?.find(
        (g: { status: string }) => g.status === 'completed'
      )

      if (!completedGen) continue

      // Use config_id (the WooCommerce book config ID) for R2 folder
      const bookConfigId = bookConfig.config_id?.toString() || bookConfig.id

      try {
        logger.info(`Generating preview images for book: ${bookConfig.name}`, {
          wooOrderId,
          configId: bookConfigId,
          skipWatermark,
        }, bookContext)
        await generatePreviewImages(completedGen.id, wooOrderId, bookConfigId, signal, skipWatermark)
      } catch (e) {
        logger.error(`Failed to generate preview images for ${bookConfig.name}`, { error: e }, bookContext)
        errors.push({ bookName: bookConfig.name, error: e })
      }
    }
  }

  // If any book failed, throw an error with details
  if (errors.length > 0) {
    const failedBooks = errors.map(e => e.bookName).join(', ')
    throw new Error(`Failed to generate preview images for: ${failedBooks}`)
  }
}
