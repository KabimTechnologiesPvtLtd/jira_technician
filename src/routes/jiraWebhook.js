import express from 'express'
import { isWebhookProcessed, markWebhookProcessed, audit } from '../db.js'
import {
  handleStatusChange,
  handleAgentComment,
} from '../handlers/outboundNotify.js'
import { env } from '../config.js'

const router = express.Router()

// Test endpoint for Postman / smoke checks.
// GET http://<host>:<port>/jira-webhook/hello → prints to the server console
// and responds with "hello world".
router.get('/hello', (_req, res) => {
  console.log('hello world')
  res.status(200).type('text/plain').send('hello world')
})

router.post('/', async (req, res) => {
  if (req.get('x-webhook-secret') !== env.jira.webhookSecret) {
    audit({
      direction: 'in',
      status: 'webhook:unauthorized',
      detail: req.ip,
    })
    return res.status(401).send('unauthorized')
  }

  const payload = req.body || {}
  const {
    webhookId,
    eventType,
    ticketKey,
    status,
    summary,
    reporterEmail,
    reporterName,
    latestComment,
    commentBody,
    commentAuthor,
  } = payload

  if (!ticketKey) {
    return res.status(400).json({ error: 'missing ticketKey' })
  }

  if (webhookId && isWebhookProcessed(webhookId)) {
    return res.status(200).json({ status: 'duplicate' })
  }

  try {
    let result
    if (eventType === 'comment') {
      result = await handleAgentComment({
        ticketKey,
        summary,
        reporterEmail,
        reporterName,
        commentBody,
        commentAuthor,
      })
    } else {
      // default: status event
      if (!status) {
        return res.status(400).json({ error: 'missing status' })
      }
      result = await handleStatusChange({
        ticketKey,
        status,
        summary,
        reporterEmail,
        reporterName,
        latestComment,
      })
    }

    if (webhookId) markWebhookProcessed(webhookId)
    res.status(200).json({ status: 'ok', result })
  } catch (err) {
    console.error('[webhook] error', err)
    audit({
      direction: 'in',
      ticketKey,
      status: 'webhook:error',
      detail: err.message,
    })
    res.status(500).json({ error: 'internal' })
  }
})

export default router
