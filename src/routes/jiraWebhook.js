import express from 'express'
import { isWebhookProcessed, markWebhookProcessed, audit } from '../db.js'
import {
  handleStatusChange,
  handleAgentComment,
} from '../handlers/outboundNotify.js'
import { env } from '../config.js'

const router = express.Router()

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
    contactEmail,
    contactName,
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
        contactEmail,
        contactName,
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
        contactEmail,
        contactName,
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
