import 'dotenv/config'
import express from 'express'
import jiraWebhook from './src/routes/jiraWebhook.js'
import health from './src/routes/health.js'
import { startWatcher } from './src/watcher.js'

const app = express()

app.use(express.json({ limit: '5mb' }))

app.use('/health', health)
app.use('/jira-webhook', jiraWebhook)

app.use((err, _req, res, _next) => {
  console.error('unhandled error', err)
  res.status(500).json({ error: 'internal' })
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`[middleware] listening on :${port}`)
  if (process.env.IMAP_WATCHER !== 'off') {
    startWatcher()
  } else {
    console.log('[middleware] IMAP watcher disabled (IMAP_WATCHER=off)')
  }
})
