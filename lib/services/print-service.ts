import { createServiceRoleClient } from '@/lib/supabase/server'
import { fetchImageFromStorage } from '@/lib/r2-client'
import JSZip from 'jszip'
import { Agent, fetch as undiciFetch } from 'undici'

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:4001'
const PDF_SERVICE_ACCESS_TOKEN = process.env.PDF_SERVICE_ACCESS_TOKEN

/**
 * Update WooCommerce order meta data
 */
async function updateWooCommerceOrderMeta(
  woocommerceOrderId: number,
  metaData: Array<{ key: string; value: string }>
): Promise<void> {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

  if (!storeUrl || !consumerKey || !consumerSecret) {
    console.warn('[Print] WooCommerce API credentials not configured, skipping meta update')
    return
  }

  const url = `${storeUrl}/wp-json/wc/v3/orders/${woocommerceOrderId}`
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

  const fetchOptions: Parameters<typeof undiciFetch>[1] = {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ meta_data: metaData }),
  }

  // Allow self-signed certificates for local development
  if (process.env.ALLOW_SELF_SIGNED_CERTS === 'true') {
    fetchOptions.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    })
  }

  const response = await undiciFetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Print] Failed to update WooCommerce order meta: ${response.status} ${errorText}`)
  } else {
    console.log(`[Print] Updated WooCommerce order ${woocommerceOrderId} meta:`, metaData.map(m => m.key).join(', '))
  }
}

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

interface BookGenerationResult {
  childName: string
  storyName: string
  configId: string
  zipBuffer: Buffer
}

interface PrintResult {
  success: boolean
  orderId: string
  orderNumber: string
  wooOrderId: string
  books: Array<{
    childName: string
    storyName: string
  }>
  combinedZipBuffer?: Buffer
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

  // Download and add images in parallel
  const selectedImages = sceneImages || []
  console.log(`📄 [Print] Fetching ${selectedImages.length} images from R2 (parallel)...`)
  const fetchStart = Date.now()

  // Fetch all images in parallel
  const fetchPromises = selectedImages
    .filter((img) => img.image_key)
    .map(async (img) => {
      const imageKey = img.image_key!
      try {
        const imageData = await fetchImageFromStorage(imageKey)
        return { img, imageData, error: null }
      } catch (e) {
        return { img, imageData: null, error: e }
      }
    })

  const results = await Promise.all(fetchPromises)

  // Process results and add to ZIP
  for (const { img, imageData, error } of results) {
    if (error) {
      console.warn(`[Print] Failed to download image ${img.image_key}:`, error)
      continue
    }

    if (!imageData) {
      console.warn(`[Print] Failed to fetch image ${img.image_key}: not found in storage`)
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
  }

  const fetchDuration = ((Date.now() - fetchStart) / 1000).toFixed(2)
  console.log(`📄 [Print] All images fetched in ${fetchDuration}s (parallel)`)

  // Generate ZIP as buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  return zipBuffer
}

/**
 * Upload ZIP to PDF service for print-ready PDF generation
 */
async function uploadZipForPrint(zipBuffer: Buffer, signal?: AbortSignal): Promise<GenerateResponse> {
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
    signal,
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
    console.log(`📄 [Print] Progress: ${progress.stage} - ${progress.message} (${progress.percent}%)`)

    if (progress.stage === 'done') {
      return
    }

    if (progress.stage === 'error') {
      throw new Error(`PDF generation failed: ${progress.message}`)
    }

    // Interruptible sleep
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, pollInterval)
      signal?.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new Error('Operation cancelled'))
      }, { once: true })
    })
  }

  throw new Error('PDF generation timed out')
}

/**
 * Download the generated book ZIP from PDF service
 */
async function downloadGeneratedBook(workId: string, signal?: AbortSignal): Promise<Buffer> {
  const response = await fetch(`${PDF_SERVICE_URL}/download/${workId}`, {
    headers: getAuthHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Generate print-ready PDF for a single generation and return the ZIP buffer
 */
async function generateAndDownloadBook(
  generationId: string,
  bookConfig: { name: string; configId: string },
  signal?: AbortSignal
): Promise<Buffer> {
  console.log(`📄 [Print] Generating print-ready PDF for ${bookConfig.name}...`)

  // Check if aborted before starting
  if (signal?.aborted) {
    throw new Error('Operation cancelled')
  }

  // Step 1: Generate ZIP from generation data
  console.log('[Print] Step 1: Generating ZIP file...')
  const zipBuffer = await generateZipForGeneration(generationId)
  console.log(`[Print] ZIP generated: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`)

  // Step 2: Upload ZIP to PDF service
  console.log('[Print] Step 2: Uploading to PDF service...')
  const response = await uploadZipForPrint(zipBuffer, signal)
  console.log(`[Print] Work ID: ${response.workId}`)

  // Step 3: Poll for completion
  console.log('[Print] Step 3: Waiting for PDF generation...')
  await pollProgress(response.workId, signal)

  // Step 4: Download the generated book
  console.log('[Print] Step 4: Downloading generated book...')
  const bookData = await downloadGeneratedBook(response.workId, signal)
  console.log(`[Print] ✅ Book generated: ${(bookData.length / 1024 / 1024).toFixed(2)} MB`)

  return bookData
}

/**
 * Options for print generation
 */
export interface PrintGenerationOptions {
  includeShippingLabel?: boolean // defaults to true
  signal?: AbortSignal // for cancellation support
}

/**
 * Generate print-ready PDFs for all completed books in an order
 * Returns a combined ZIP buffer containing all book ZIPs
 */
export async function generateOrderForPrint(
  woocommerceOrderId: number,
  options?: PrintGenerationOptions
): Promise<PrintResult> {
  const includeShippingLabel = options?.includeShippingLabel !== false // default to true
  const signal = options?.signal
  const supabase = createServiceRoleClient()

  // Find order by WooCommerce ID - include shipping label info
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      woocommerce_order_id,
      speedy_shipment_id,
      bg_carriers_carrier,
      billing_first_name,
      billing_last_name,
      billing_phone,
      billing_email,
      billing_city,
      billing_address_1,
      billing_postcode,
      total,
      payment_method,
      bg_carriers_service_type,
      speedy_pickup_location_id,
      speedy_delivery_city_id,
      speedy_delivery_city_name,
      speedy_delivery_postcode,
      speedy_delivery_street_id,
      speedy_delivery_street_name,
      speedy_delivery_street_number,
      speedy_delivery_full_address
    `)
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

  const orderNumber = order.order_number || woocommerceOrderId.toString()

  const completedBooks: BookGenerationResult[] = []
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

      // Check if aborted before starting each book
      if (signal?.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        const bookZipBuffer = await generateAndDownloadBook(
          completedGen.id,
          {
            name: bookConfig.name,
            configId: bookConfig.config_id?.toString() || bookConfig.id,
          },
          signal
        )

        // Extract story name from content
        const content = bookConfig.content as { title?: string } | null
        const storyName = content?.title || 'Unknown Story'

        completedBooks.push({
          childName: bookConfig.name,
          storyName,
          configId: bookConfig.config_id?.toString() || bookConfig.id,
          zipBuffer: bookZipBuffer,
        })
      } catch (e) {
        console.error(`[Print] Failed to generate book for ${bookConfig.name}:`, e)
        errors.push({ bookName: bookConfig.name, error: e })
      }
    }
  }

  // If any books failed, include error info in result
  if (errors.length > 0 && completedBooks.length === 0) {
    const failedBooks = errors.map(e => e.bookName).join(', ')
    return {
      success: false,
      orderId: order.id,
      orderNumber,
      wooOrderId: woocommerceOrderId.toString(),
      books: [],
      error: `Failed to generate books for: ${failedBooks}`,
    }
  }

  // Combine all book PDFs into a single ZIP
  // Structure:
  // - Single book: book.pdf, cover.pdf, back.pdf in root
  // - Multiple books: <configId>/book.pdf, <configId>/cover.pdf, <configId>/back.pdf
  // - Shipping label: <wooOrderId>-shipping-label.pdf in root
  let combinedZipBuffer: Buffer | undefined
  let shippingLabelError: string | undefined

  if (completedBooks.length > 0) {
    console.log(`[Print] Combining ${completedBooks.length} books into single ZIP...`)
    const combinedZip = new JSZip()
    const isSingleBook = completedBooks.length === 1

    for (const book of completedBooks) {
      // Load the book's ZIP to extract its contents
      const bookZip = await JSZip.loadAsync(book.zipBuffer)

      // Get all files from the book ZIP (book.pdf, cover.pdf, back.pdf, book-preview.pdf)
      const files = Object.keys(bookZip.files).filter(name => !bookZip.files[name].dir)

      for (const fileName of files) {
        const fileContent = await bookZip.files[fileName].async('nodebuffer')

        // Determine the target path
        let targetPath: string
        if (isSingleBook) {
          // Single book: put files directly in root
          targetPath = fileName
        } else {
          // Multiple books: put files in configId folder
          targetPath = `${book.configId}/${fileName}`
        }

        combinedZip.file(targetPath, fileContent)
      }
    }

    // Add shipping label PDF if order uses Speedy and includeShippingLabel is true
    if (order.bg_carriers_carrier === 'speedy' && includeShippingLabel) {
      try {
        const { createShippingLabel, downloadShippingLabelPdf } = await import('./speedy-service')

        let shipmentId = order.speedy_shipment_id

        // If shipping label doesn't exist, generate it first
        if (!shipmentId) {
          console.log(`[Print] Shipping label not found, generating...`)

          // Fetch line items for the shipping label
          const { data: lineItemsForShipping } = await supabase
            .from('line_items')
            .select('id, product_name, quantity, total')
            .eq('order_id', order.id)

          const orderData = {
            id: order.id,
            woocommerce_order_id: order.woocommerce_order_id,
            billing_first_name: order.billing_first_name,
            billing_last_name: order.billing_last_name,
            billing_phone: order.billing_phone,
            billing_email: order.billing_email,
            billing_city: order.billing_city,
            billing_address_1: order.billing_address_1,
            billing_postcode: order.billing_postcode,
            total: order.total,
            payment_method: order.payment_method,
            bg_carriers_service_type: order.bg_carriers_service_type as 'office' | 'apm' | 'home',
            speedy_pickup_location_id: order.speedy_pickup_location_id,
            speedy_delivery_city_id: order.speedy_delivery_city_id,
            speedy_delivery_city_name: order.speedy_delivery_city_name,
            speedy_delivery_postcode: order.speedy_delivery_postcode,
            speedy_delivery_street_id: order.speedy_delivery_street_id,
            speedy_delivery_street_name: order.speedy_delivery_street_name,
            speedy_delivery_street_number: order.speedy_delivery_street_number,
            speedy_delivery_full_address: order.speedy_delivery_full_address,
            line_items: (lineItemsForShipping || []).map(item => ({
              id: item.id,
              product_name: item.product_name,
              quantity: item.quantity,
              total: item.total,
            })),
          }

          const result = await createShippingLabel(orderData)
          shipmentId = result.shipmentId

          // Save shipment ID to database
          await supabase
            .from('orders')
            .update({
              speedy_shipment_id: shipmentId,
              speedy_label_created_at: new Date().toISOString(),
            })
            .eq('id', order.id)

          // Update WooCommerce order meta (non-blocking)
          updateWooCommerceOrderMeta(order.woocommerce_order_id, [
            { key: '_speedy_shipment_id', value: shipmentId },
          ]).catch(err => {
            console.error('[Print] Failed to update WooCommerce order meta:', err)
          })

          console.log(`[Print] Shipping label generated: ${shipmentId}`)
        }

        // Download shipping label PDF
        console.log(`[Print] Downloading shipping label PDF for shipment ${shipmentId}...`)
        const shippingLabelPdf = await downloadShippingLabelPdf(shipmentId)

        // Add to ZIP with name <wooOrderId>-shipping-label.pdf
        const shippingLabelFileName = `${woocommerceOrderId}-shipping-label.pdf`
        combinedZip.file(shippingLabelFileName, shippingLabelPdf)
        console.log(`[Print] ✅ Shipping label added: ${shippingLabelFileName}`)
      } catch (shippingError) {
        const errorMsg = shippingError instanceof Error ? shippingError.message : String(shippingError)
        console.error(`[Print] Failed to add shipping label:`, shippingError)
        shippingLabelError = `Failed to add shipping label: ${errorMsg}`
        // Don't fail the whole process - just log the error
      }
    }

    combinedZipBuffer = await combinedZip.generateAsync({ type: 'nodebuffer' })
    console.log(`[Print] ✅ Combined ZIP created: ${(combinedZipBuffer.length / 1024 / 1024).toFixed(2)} MB`)
  }

  // Combine all errors
  const allErrors: string[] = []
  if (errors.length > 0) {
    allErrors.push(`Failed to generate some books: ${errors.map(e => e.bookName).join(', ')}`)
  }
  if (shippingLabelError) {
    allErrors.push(shippingLabelError)
  }

  return {
    success: completedBooks.length > 0,
    orderId: order.id,
    orderNumber,
    wooOrderId: woocommerceOrderId.toString(),
    books: completedBooks.map(b => ({
      childName: b.childName,
      storyName: b.storyName,
    })),
    combinedZipBuffer,
    error: allErrors.length > 0 ? allErrors.join('; ') : undefined,
  }
}
