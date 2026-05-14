/**
 * Simple file-based storage. JSONL (one JSON object per line) for append-only logs.
 * No native deps -> works on any Node version + cPanel without compilation.
 *
 * Files (all under data/):
 *   processed-messages.jsonl  { id, ticketKey, ts }
 *   processed-webhooks.jsonl  { id, ts }
 *   audit.log.jsonl           { ts, direction, ticketKey, subject, status, detail }
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const messagesFile = path.join(dataDir, 'processed-messages.jsonl')
const webhooksFile = path.join(dataDir, 'processed-webhooks.jsonl')
const confirmationsFile = path.join(dataDir, 'sent-confirmations.jsonl')
const auditFile = path.join(dataDir, 'audit.log.jsonl')

function loadIds(file) {
  if (!fs.existsSync(file)) return new Set()
  const set = new Set()
  const data = fs.readFileSync(file, 'utf8')
  for (const line of data.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed)
      if (obj.id) set.add(obj.id)
    } catch {
      // malformed line, skip
    }
  }
  return set
}

// Each process loads once at startup. cron exits between runs (so always fresh).
// The Express server is long-lived but only writes to processed-webhooks itself,
// so there's no cross-process cache invalidation problem.
let messagesCache = null
let webhooksCache = null
let confirmationsCache = null

function getMessages() {
  if (messagesCache === null) messagesCache = loadIds(messagesFile)
  return messagesCache
}

function getWebhooks() {
  if (webhooksCache === null) webhooksCache = loadIds(webhooksFile)
  return webhooksCache
}

function getConfirmations() {
  if (confirmationsCache === null) confirmationsCache = loadIds(confirmationsFile)
  return confirmationsCache
}

export const isMessageProcessed = (id) => getMessages().has(id)

export const markMessageProcessed = (id, ticketKey = null) => {
  if (!id) return
  const set = getMessages()
  if (set.has(id)) return
  fs.appendFileSync(
    messagesFile,
    JSON.stringify({ id, ticketKey, ts: Date.now() }) + '\n'
  )
  set.add(id)
}

export const isWebhookProcessed = (id) => getWebhooks().has(id)

export const markWebhookProcessed = (id) => {
  if (!id) return
  const set = getWebhooks()
  if (set.has(id)) return
  fs.appendFileSync(
    webhooksFile,
    JSON.stringify({ id, ts: Date.now() }) + '\n'
  )
  set.add(id)
}

/**
 * Tracks "we've already sent the ticket_received email for this ticket".
 * The inbound-email path marks it when it creates a ticket; the webhook
 * path checks it before sending so the customer doesn't get the same
 * confirmation twice when both paths fire (Jira automation fires Issue
 * Created even for tickets the middleware created itself).
 */
export const wasConfirmationSent = (ticketKey) =>
  ticketKey ? getConfirmations().has(ticketKey) : false

export const markConfirmationSent = (ticketKey) => {
  if (!ticketKey) return
  const set = getConfirmations()
  if (set.has(ticketKey)) return
  fs.appendFileSync(
    confirmationsFile,
    JSON.stringify({ id: ticketKey, ts: Date.now() }) + '\n'
  )
  set.add(ticketKey)
}

export const audit = ({ direction, ticketKey, subject, status, detail } = {}) => {
  fs.appendFileSync(
    auditFile,
    JSON.stringify({
      ts: Date.now(),
      direction: direction || null,
      ticketKey: ticketKey || null,
      subject: subject || null,
      status: status || null,
      detail: detail || null,
    }) + '\n'
  )
}

export default { getMessages, getWebhooks }
