import 'dotenv/config'
import express from 'express'
import jiraWebhook from './src/routes/jiraWebhook.js'
import health from './src/routes/health.js'
import test from './src/routes/test.js'

const app = express()

app.use(express.json({ limit: '5mb' }))

// Global request logger — prints details of every incoming request.
// Sensitive headers (webhook secret, authorization) are masked.
app.use((req, _res, next) => {
  const maskedHeaders = { ...req.headers }
  if (maskedHeaders['x-webhook-secret']) maskedHeaders['x-webhook-secret'] = '***'
  if (maskedHeaders['authorization']) maskedHeaders['authorization'] = '***'
  console.log('[request]', req.method, req.originalUrl, {
    ip: req.ip,
    query: req.query,
    headers: maskedHeaders,
    body: req.body,
  })
  next()
})

app.use('/health', health)
app.use('/jira-webhook', jiraWebhook)
app.use('/test', test)

app.use((err, _req, res, _next) => {
  console.error('unhandled error', err)
  res.status(500).json({ error: 'internal' })
})

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
        const mount = layer.regexp?.source
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

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`[middleware] listening on :${port}`)
  console.log('[middleware] registered endpoints:')
  for (const ep of listEndpoints(app)) {
    console.log('  ' + ep)
  }
})
