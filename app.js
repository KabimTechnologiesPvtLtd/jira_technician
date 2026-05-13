import 'dotenv/config'
import express from 'express'
import jiraWebhook from './src/routes/jiraWebhook.js'
import health from './src/routes/health.js'
import { startWatcher } from './src/watcher.js'

const app = express()

app.use(express.json({ limit: '5mb' }))

// ----- Comprehensive request/response logger -----
// Logs every incoming request and the matching response status + duration.
// Sensitive headers are masked. Body capture is limited to 10KB.
const MASK = '***'
const SENSITIVE_HEADERS = new Set([
  'x-webhook-secret',
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
])

function maskHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? MASK : v
  }
  return out
}

function truncate(value, max = 10_000) {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    if (!s) return s
    return s.length > max ? s.slice(0, max) + `…(truncated, total=${s.length})` : value
  } catch {
    return '(unserializable)'
  }
}

// Cheap pre-filter for obvious bot scans (WP, PHP, .env probes, etc.).
// We still respond (Express 404 handler), just don't pollute the log.
const BOT_PATH_RX = /\.(php|asp|aspx|cgi|env|git|sql|bak)\b|wp-(admin|login|content|includes)|xmlrpc|phpmyadmin|owa|\/cgi-bin\//i
const isBotProbe = (url) => BOT_PATH_RX.test(url || '')

app.use((req, res, next) => {
  if (isBotProbe(req.originalUrl)) {
    // Single brief line so we know it happened but don't dump full headers.
    console.log(`[bot] ${req.method} ${req.originalUrl} from ${req.ip}`)
    return res.status(404).send('not found')
  }
  next()
})

app.use((req, res, next) => {
  const startedAt = Date.now()
  const reqId = `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  console.log('[request]', {
    reqId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    protocol: req.protocol,
    httpVersion: req.httpVersion,
    host: req.get('host'),
    hostname: req.hostname,
    ip: req.ip,
    ips: req.ips,
    secure: req.secure,
    xhr: req.xhr,
    userAgent: req.get('user-agent'),
    referer: req.get('referer') || req.get('referrer'),
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
    query: req.query,
    params: req.params,
    headers: maskHeaders(req.headers),
    body: truncate(req.body),
  })

  res.on('finish', () => {
    console.log('[response]', {
      reqId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      statusMessage: res.statusMessage,
      contentType: res.get('content-type'),
      contentLength: res.get('content-length'),
      durationMs: Date.now() - startedAt,
    })
  })

  res.on('close', () => {
    if (!res.writableEnded) {
      console.warn('[response:aborted]', {
        reqId,
        method: req.method,
        url: req.originalUrl,
        durationMs: Date.now() - startedAt,
      })
    }
  })

  next()
})

// ----- Routes -----
app.use('/health', health)
app.use('/jira-webhook', jiraWebhook)

// ----- Error handler -----
app.use((err, req, res, _next) => {
  console.error('[error]', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    stack: err.stack,
  })
  res.status(500).json({ error: 'internal' })
})

// ----- Endpoint discovery (printed at startup) -----
function listEndpoints(expressApp) {
  const endpoints = []
  const walk = (stack, prefix = '') => {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase())
        for (const method of methods) {
          endpoints.push(`${method.padEnd(6)} ${prefix}${layer.route.path}`)
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const mount =
          layer.regexp?.source
            ?.replace('^\\/', '/')
            ?.replace('\\/?(?=\\/|$)', '')
            ?.replace(/\\\//g, '/') || ''
        walk(layer.handle.stack, prefix + mount)
      }
    }
  }
  walk(expressApp._router.stack)
  return endpoints
}

// ----- Start server -----
const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`[middleware] listening on :${port}`)
  console.log('[middleware] registered endpoints:')
  for (const ep of listEndpoints(app)) {
    console.log('  ' + ep)
  }
  if (process.env.IMAP_WATCHER !== 'off') {
    startWatcher()
  } else {
    console.log('[middleware] IMAP watcher disabled (IMAP_WATCHER=off)')
  }
})
