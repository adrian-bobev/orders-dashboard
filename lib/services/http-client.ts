import https from 'https'
import http from 'http'

/**
 * HTTP/HTTPS request options
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: object | string
  allowSelfSignedCerts?: boolean
}

/**
 * HTTP response structure
 */
export interface HttpResponse<T = any> {
  status: number
  statusText: string
  data: T
}

/**
 * Create HTTPS agent that accepts self-signed certificates for local development only
 */
function createHttpsAgent(allowSelfSignedCerts: boolean): https.Agent {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const shouldAllowSelfSigned = isDevelopment && allowSelfSignedCerts

  if (shouldAllowSelfSigned) {
    console.log('⚠️ Using HTTPS agent with self-signed cert support (development only)')
    return new https.Agent({ rejectUnauthorized: false })
  }

  return new https.Agent({ rejectUnauthorized: true })
}

/**
 * Make HTTP/HTTPS request
 * Unified wrapper for both GET and POST requests with JSON body support
 */
export function makeRequest<T = any>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const requestModule = isHttps ? https : http

    const method = options.method || 'GET'
    const bodyString = options.body
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : undefined

    const requestOptions: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        ...options.headers,
        ...(bodyString && { 'Content-Length': Buffer.byteLength(bodyString).toString() }),
      },
    }

    // Add HTTPS agent if needed
    if (isHttps) {
      requestOptions.agent = createHttpsAgent(options.allowSelfSignedCerts || false)
    }

    const req = requestModule.request(requestOptions, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null
          resolve({
            status: res.statusCode || 500,
            statusText: res.statusMessage || 'Unknown',
            data: jsonData,
          })
        } catch {
          // If JSON parsing fails, return raw data
          resolve({
            status: res.statusCode || 500,
            statusText: res.statusMessage || 'Unknown',
            data: data as T,
          })
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    if (bodyString) {
      req.write(bodyString)
    }

    req.end()
  })
}

/**
 * Convenience method for POST requests with JSON body
 */
export function postJson<T = any>(
  url: string,
  body: object,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return makeRequest<T>(url, {
    ...options,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Convenience method for GET requests
 */
export function get<T = any>(
  url: string,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return makeRequest<T>(url, {
    ...options,
    method: 'GET',
  })
}
