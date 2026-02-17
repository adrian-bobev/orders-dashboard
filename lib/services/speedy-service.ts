/**
 * Speedy API Service for creating shipping labels (товарителници)
 *
 * API Documentation: https://www.speedy.bg/speedy-api/
 * Reference: bulgarisation-for-woocommerce plugin
 */

import { getSpeedySettings } from './settings-service'

const SPEEDY_API_URL = 'https://api.speedy.bg/v1'

// Configuration constants
const SPEEDY_CONFIG = {
  SERVICE_ID: 505, // Bulgaria domestic service
  WEIGHT_PER_BOOK_KG: 0.3,
  COUNTRY_ID_BULGARIA: 100,
  SENDER: {
    COMPANY: 'ДИГИТАЛ НАРАТИВ ЕООД',
    CONTACT_NAME: 'АДРИАН БОБЕВ',
    PHONE: '0883451860',
    EMAIL: 'info@prikazko.bg',
  },
}

interface SpeedyCredentials {
  userName: string
  password: string
}

interface LineItem {
  id: string
  product_name: string
  quantity: number
  total: number
  book_configurations?: Array<{
    id: string
    name: string
    content?: {
      title?: string
    }
  }>
}

interface OrderData {
  id: string
  woocommerce_order_id: number
  billing_first_name: string
  billing_last_name: string
  billing_phone: string | null
  billing_email: string
  total: number
  payment_method: string // 'cod' for cash on delivery, 'stripe', 'bacs', etc.

  // Delivery type (NEW)
  bg_carriers_delivery_type: 'pickup' | 'home' | null

  // Pickup delivery fields
  speedy_pickup_location_id: string | null
  speedy_pickup_location_type: 'office' | 'apm' | null
  speedy_pickup_location_city_id: string | null

  // Home delivery fields
  speedy_delivery_city_id: string | null
  speedy_delivery_city_name: string | null
  speedy_delivery_postcode: string | null
  speedy_delivery_street_id: string | null
  speedy_delivery_street_name: string | null
  speedy_delivery_street_type: 'street' | 'complex' | 'custom' | null
  speedy_delivery_street_number: string | null

  // Billing fallback
  billing_city: string | null
  billing_address_1: string | null
  billing_postcode: string | null

  // Line items
  line_items: LineItem[]
}

interface SpeedyShipmentResponse {
  id: string // Shipment ID (waybill number)
  parcels: Array<{
    id: string
    seqNo: number
  }>
  price: {
    amount: number
    vat: number
    total: number
    currency: string
  }
  pickupDate: string
  deliveryDeadline: string
}

interface SpeedyErrorResponse {
  error: {
    message: string
    code: string
    context?: string
  }
}

export interface SpeedyProfile {
  clientId: number
  clientName: string
  contactName: string
  address: {
    siteName: string
    streetName?: string
    streetNo?: string
  }
  phones?: Array<{ number: string }>
}

export interface SpeedyOffice {
  id: number
  name: string
  address: {
    siteName: string
    streetName?: string
    streetNo?: string
    fullAddressString?: string
  }
  workingTimeSchedule?: {
    date: string
    workingTimeFrom: string
    workingTimeTo: string
  }
}

function getCredentials(): SpeedyCredentials {
  const userName = process.env.SPEEDY_USERNAME
  const password = process.env.SPEEDY_PASSWORD

  if (!userName || !password) {
    throw new Error('Speedy API credentials not configured. Set SPEEDY_USERNAME and SPEEDY_PASSWORD environment variables.')
  }

  return { userName, password }
}

interface SenderConfig {
  clientId: number
  dropoffOfficeId: number | null
  sendFrom: 'office' | 'address'
  senderName: string | null
  senderPhone: string | null
}

/**
 * Get sender configuration from database settings
 * Falls back to environment variables if database settings are not set
 */
async function getSenderConfig(): Promise<SenderConfig> {
  // Try to get from database first
  const settings = await getSpeedySettings()

  // Check for client ID
  let clientId = settings.clientId
  if (!clientId) {
    const envClientId = process.env.SPEEDY_CLIENT_ID
    if (envClientId) {
      clientId = parseInt(envClientId, 10)
    }
  }

  if (!clientId) {
    throw new Error('Speedy client ID not configured. Configure via Admin Settings or set SPEEDY_CLIENT_ID environment variable.')
  }

  // For office mode, we need dropoffOfficeId
  const sendFrom = settings.sendFrom || 'address'
  let dropoffOfficeId = settings.dropoffOfficeId

  if (sendFrom === 'office' && !dropoffOfficeId) {
    const envOfficeId = process.env.SPEEDY_DROPOFF_OFFICE_ID
    if (envOfficeId) {
      dropoffOfficeId = parseInt(envOfficeId, 10)
    }
  }

  if (sendFrom === 'office' && !dropoffOfficeId) {
    throw new Error('Speedy dropoff office ID not configured. Configure via Admin Settings or set SPEEDY_DROPOFF_OFFICE_ID environment variable.')
  }

  return {
    clientId,
    dropoffOfficeId: sendFrom === 'office' ? dropoffOfficeId : null,
    sendFrom,
    senderName: settings.senderName,
    senderPhone: settings.senderPhone,
  }
}

/**
 * Fetch all profiles/contracts associated with the Speedy account
 * Call this to populate the admin settings dropdown
 */
export async function fetchSpeedyProfiles(): Promise<SpeedyProfile[]> {
  const credentials = getCredentials()

  // Get contract info
  const contractResponse = await fetch(`${SPEEDY_API_URL}/client/contract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      language: 'BG',
    }),
  })

  const contractData = await contractResponse.json()

  if (contractData.error) {
    throw new Error(contractData.error.message || 'Failed to fetch Speedy profiles')
  }

  // contractData.clients contains all profiles
  const profiles: SpeedyProfile[] = []

  if (contractData.clients && Array.isArray(contractData.clients)) {
    for (const client of contractData.clients) {
      profiles.push({
        clientId: client.clientId,
        clientName: client.clientName || client.privatePersonName || 'Unknown',
        contactName: client.contactName || client.privatePersonName || '',
        address: {
          siteName: client.address?.siteName || '',
          streetName: client.address?.streetName || '',
          streetNo: client.address?.streetNo || '',
        },
        phones: client.phones,
      })
    }
  }

  return profiles
}

/**
 * Fetch offices for a specific city
 * Used to select the dropoff office for sending
 */
export async function fetchSpeedyOffices(cityId: number): Promise<SpeedyOffice[]> {
  const credentials = getCredentials()

  const response = await fetch(`${SPEEDY_API_URL}/location/office`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      language: 'BG',
      countryId: SPEEDY_CONFIG.COUNTRY_ID_BULGARIA,
      siteId: cityId,
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.message || 'Failed to fetch Speedy offices')
  }

  const offices: SpeedyOffice[] = []

  if (data.offices && Array.isArray(data.offices)) {
    for (const office of data.offices) {
      offices.push({
        id: office.id,
        name: office.name,
        address: {
          siteName: office.address?.siteName || '',
          streetName: office.address?.streetName || '',
          streetNo: office.address?.streetNo || '',
          fullAddressString: office.address?.fullAddressString || '',
        },
        workingTimeSchedule: office.workingTimeSchedule,
      })
    }
  }

  return offices
}

/**
 * Search for cities by name
 */
export async function searchSpeedyCities(query: string): Promise<Array<{ id: number; name: string; postCode?: string }>> {
  const credentials = getCredentials()

  const response = await fetch(`${SPEEDY_API_URL}/location/site`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      language: 'BG',
      countryId: SPEEDY_CONFIG.COUNTRY_ID_BULGARIA,
      name: query,
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.message || 'Failed to search cities')
  }

  return (data.sites || []).map((site: { id: number; name: string; postCode?: string }) => ({
    id: site.id,
    name: site.name,
    postCode: site.postCode,
  }))
}

function calculateTotalWeight(lineItems: LineItem[]): number {
  const totalQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0)
  return totalQuantity * SPEEDY_CONFIG.WEIGHT_PER_BOOK_KG
}

function buildFiscalReceiptItems(lineItems: LineItem[]): Array<{
  description: string
  vatGroup: string
  amount: number
  amountWithVat: number
}> {
  return lineItems.map((item) => {
    const totalAmount = Number(item.total)

    // Books in Bulgaria are taxed at 9% VAT (reduced rate)
    // item.total is the final price including VAT
    // amount = pre-tax value, amountWithVat = total with VAT
    const vatRate = 0.09 // 9% VAT for books in Bulgaria
    const amountWithoutVat = Number((totalAmount / (1 + vatRate)).toFixed(2))

    return {
      description: 'Книга',
      vatGroup: 'Г', // VAT group "Г" for books (9% reduced rate in Bulgaria)
      amount: amountWithoutVat,
      amountWithVat: totalAmount,
    }
  })
}

/**
 * Parse street number - split by comma
 * First part is streetNo (max 10 chars), rest goes to addressNote
 * Example: "2, бл. 212, вх. Б" -> streetNo: "2", addressNote: "бл. 212, вх. Б"
 */
function parseStreetNumber(streetNumber: string): { streetNo: string; addressNote?: string } {
  const parts = streetNumber.split(',').map(p => p.trim())
  const streetNo = parts.shift() || ''

  // Ensure streetNo is max 10 chars
  const truncatedStreetNo = streetNo.substring(0, 10)

  if (parts.length > 0) {
    return {
      streetNo: truncatedStreetNo,
      addressNote: parts.join(', '),
    }
  }

  return { streetNo: truncatedStreetNo }
}

function buildRecipient(order: OrderData): Record<string, unknown> {
  const deliveryType = order.bg_carriers_delivery_type

  const baseRecipient = {
    privatePerson: true,
    clientName: `${order.billing_first_name} ${order.billing_last_name}`.trim(),
    phone1: { number: order.billing_phone || '' },
    email: order.billing_email,
  }

  // PICKUP DELIVERY (Office or APM)
  if (deliveryType === 'pickup') {
    const locationId = order.speedy_pickup_location_id
    const locationType = order.speedy_pickup_location_type

    if (!locationId) {
      throw new Error('Pickup location ID is required for pickup delivery')
    }

    console.log(`[Speedy] Creating ${locationType || 'pickup'} label for location ${locationId}`)

    return {
      ...baseRecipient,
      pickupOfficeId: parseInt(locationId, 10),
    }
  }

  // HOME DELIVERY
  if (deliveryType === 'home') {
    const streetType = order.speedy_delivery_street_type

    const address: Record<string, unknown> = {
      countryId: SPEEDY_CONFIG.COUNTRY_ID_BULGARIA,
    }

    // City (required)
    if (order.speedy_delivery_city_id) {
      address.siteId = parseInt(order.speedy_delivery_city_id, 10)
    } else if (order.speedy_delivery_city_name) {
      address.siteName = order.speedy_delivery_city_name
    } else if (order.billing_city) {
      address.siteName = order.billing_city
    } else {
      throw new Error('City is required for home delivery')
    }

    console.log(`[Speedy] Creating home delivery label (street type: ${streetType || 'unknown'})`)

    // Postcode (optional)
    if (order.speedy_delivery_postcode) {
      address.postCode = order.speedy_delivery_postcode
    } else if (order.billing_postcode) {
      address.postCode = order.billing_postcode
    }

    // Handle address based on street type
    if (streetType === 'custom') {
      // Custom address: manually entered, not in Speedy database
      console.log('[Speedy] Using custom address (not in Speedy DB)')

      // Combine street name + number into addressNote
      let customAddress = order.speedy_delivery_street_name || ''
      if (order.speedy_delivery_street_number) {
        customAddress += (customAddress ? ' ' : '') + order.speedy_delivery_street_number
      }

      address.addressNote = customAddress || order.billing_address_1 || 'No address provided'

    } else {
      // Street or complex from Speedy database
      if (order.speedy_delivery_street_id) {
        address.streetId = parseInt(order.speedy_delivery_street_id, 10)
      }

      if (order.speedy_delivery_street_name) {
        address.streetName = order.speedy_delivery_street_name
      }

      if (order.speedy_delivery_street_number) {
        const parsed = parseStreetNumber(order.speedy_delivery_street_number)
        address.streetNo = parsed.streetNo
        if (parsed.addressNote) {
          address.addressNote = parsed.addressNote
        }
      }

      if (streetType === 'complex') {
        console.log('[Speedy] Delivery to residential complex (жк)')
      }
    }

    return {
      ...baseRecipient,
      address,
    }
  }

  throw new Error(`Invalid delivery type: ${deliveryType}. Expected "pickup" or "home"`)
}

async function buildShipmentRequest(
  credentials: SpeedyCredentials,
  order: OrderData
): Promise<Record<string, unknown>> {
  const senderConfig = await getSenderConfig()
  // COD only applies when payment method is 'cod' (cash on delivery)
  const isCodPayment = order.payment_method === 'cod'
  const isApmDelivery = order.bg_carriers_delivery_type === 'pickup' && order.speedy_pickup_location_type === 'apm'

  // Build additional services
  const additionalServices: Record<string, unknown> = {}

  // OBPD (Open Before Paying) is not allowed for APM deliveries
  if (!isApmDelivery) {
    additionalServices.obpd = {
      option: 'OPEN',
      returnShipmentServiceId: SPEEDY_CONFIG.SERVICE_ID,
      returnShipmentPayer: 'SENDER',
    }
  }

  // Add COD only if payment method is 'cod'
  if (isCodPayment) {
    // Build fiscal receipt items first
    const fiscalReceiptItems = buildFiscalReceiptItems(order.line_items)

    // COD amount must match the sum of fiscal receipt items (amountWithVat)
    // This ensures consistency when there are discounts applied
    const codAmount = fiscalReceiptItems.reduce((sum, item) => sum + item.amountWithVat, 0)

    if (codAmount > 0) {
      additionalServices.cod = {
        amount: Number(codAmount.toFixed(2)),
        processingType: 'CASH',
        fiscalReceiptItems,
      }
    }
  }

  // Build sender object
  const sender: Record<string, unknown> = {
    clientId: senderConfig.clientId,
    phone1: { number: senderConfig.senderPhone || SPEEDY_CONFIG.SENDER.PHONE },
    contactName: senderConfig.senderName || SPEEDY_CONFIG.SENDER.CONTACT_NAME,
    email: SPEEDY_CONFIG.SENDER.EMAIL,
  }

  // Only add dropoffOfficeId if sending from office
  if (senderConfig.sendFrom === 'office' && senderConfig.dropoffOfficeId) {
    sender.dropoffOfficeId = senderConfig.dropoffOfficeId
  }

  const request: Record<string, unknown> = {
    userName: credentials.userName,
    password: credentials.password,
    language: 'BG',
    sender,
    recipient: buildRecipient(order),
    service: {
      serviceId: SPEEDY_CONFIG.SERVICE_ID,
      autoAdjustPickupDate: true,
      additionalServices,
    },
    content: {
      parcelsCount: 1,
      totalWeight: calculateTotalWeight(order.line_items),
      contents: 'Книга',
      package: 'ENVELOPE',
    },
    payment: {
      // For home delivery with COD, receiver pays for courier service
      courierServicePayer: (order.bg_carriers_delivery_type === 'home' && isCodPayment) ? 'RECIPIENT' : 'SENDER',
      declaredValuePayer: 'SENDER',
      packagePayer: 'SENDER',
    },
    ref1: `Order ${order.woocommerce_order_id}`,
  }

  return request
}

export async function createShippingLabel(order: OrderData): Promise<{
  shipmentId: string
  trackingUrl: string
  price: {
    amount: number
    total: number
    currency: string
  }
  pickupDate: string
  deliveryDeadline: string
}> {
  const credentials = getCredentials()
  const request = await buildShipmentRequest(credentials, order)

  console.log('[Speedy] Creating shipment for order:', order.woocommerce_order_id)

  const response = await fetch(`${SPEEDY_API_URL}/shipment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  const data = await response.json()

  if (!response.ok || data.error) {
    const errorData = data as SpeedyErrorResponse
    console.error('[Speedy] API Error:', errorData)
    throw new Error(
      errorData.error?.message ||
      `Speedy API error: ${response.status} ${response.statusText}`
    )
  }

  const shipmentData = data as SpeedyShipmentResponse
  console.log('[Speedy] Shipment created:', shipmentData.id)

  return {
    shipmentId: shipmentData.id,
    trackingUrl: `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${shipmentData.id}`,
    price: shipmentData.price ? {
      amount: shipmentData.price.amount,
      total: shipmentData.price.total,
      currency: shipmentData.price.currency,
    } : {
      amount: 0,
      total: 0,
      currency: 'BGN',
    },
    pickupDate: shipmentData.pickupDate || '',
    deliveryDeadline: shipmentData.deliveryDeadline || '',
  }
}

export async function getShipmentInfo(shipmentId: string): Promise<{
  status: string
  events: Array<{
    date: string
    description: string
  }>
}> {
  const credentials = getCredentials()

  const response = await fetch(`${SPEEDY_API_URL}/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      language: 'BG',
      parcels: [shipmentId],
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get shipment info: ${response.status}`)
  }

  const data = await response.json()

  // Parse tracking response
  const parcelInfo = data.parcels?.[0]
  if (!parcelInfo) {
    throw new Error('Shipment not found')
  }

  return {
    status: parcelInfo.operations?.[0]?.operationDescription || 'Unknown',
    events: (parcelInfo.operations || []).map((op: { dateTime: string; operationDescription: string }) => ({
      date: op.dateTime,
      description: op.operationDescription,
    })),
  }
}

/**
 * Download shipping label PDF from Speedy API
 * Returns the PDF as a Buffer
 */
export async function downloadShippingLabelPdf(shipmentId: string): Promise<Buffer> {
  const credentials = getCredentials()

  const response = await fetch(`${SPEEDY_API_URL}/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      paperSize: 'A6',
      parcels: [
        {
          parcel: {
            id: shipmentId,
          },
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to download shipping label: ${response.status} ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Cancel/delete a shipping label via Speedy API
 */
export async function cancelShippingLabel(shipmentId: string, comment: string = 'Анулиране'): Promise<void> {
  const credentials = getCredentials()

  const response = await fetch(`${SPEEDY_API_URL}/shipment/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: credentials.userName,
      password: credentials.password,
      shipmentId,
      comment,
    }),
  })

  const data = await response.json()

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Failed to cancel shipment: ${response.status}`)
  }

  console.log(`[Speedy] Shipment ${shipmentId} cancelled`)
}
