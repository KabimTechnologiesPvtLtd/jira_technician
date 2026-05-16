import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findOrgForEmail } from './orgMapping.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', 'data', 'contacts.json')

let cache = null
let cacheMtime = 0

function load() {
  try {
    const stat = fs.statSync(file)
    if (cache && stat.mtimeMs === cacheMtime) return cache
    cache = JSON.parse(fs.readFileSync(file, 'utf8'))
    cacheMtime = stat.mtimeMs
    return cache
  } catch {
    return { byOrgId: {} }
  }
}

function listForOrg(orgId) {
  if (orgId == null) return []
  const map = load()
  return map.byOrgId?.[String(orgId)] || []
}

export function findPrimaryContactForOrg(orgId) {
  const list = listForOrg(orgId)
  if (list.length === 0) return null
  return list.find((c) => c.isPrimary) || list[0] || null
}

export function findContactByEmail(email) {
  if (!email) return null
  const lower = email.toLowerCase()
  const map = load()
  for (const list of Object.values(map.byOrgId || {})) {
    const hit = list.find((c) => c.email?.toLowerCase() === lower)
    if (hit) return hit
  }
  return null
}

/**
 * Implements the client's core ask: ticket updates go TO the org's primary
 * contact, with the person who actually emailed in (the Jira reporter) on CC.
 * Falls back to the original behavior (reporter as the sole To:) when no
 * contact is configured, or when the reporter already *is* the contact.
 *
 * @returns {{ to: string, cc: string[], contact: object|null }}
 */
export function resolveRecipients(reporterEmail) {
  const fallback = { to: reporterEmail, cc: [], contact: null }
  if (!reporterEmail) return fallback

  const org = findOrgForEmail(reporterEmail)
  if (!org?.orgId) return fallback

  const contact = findPrimaryContactForOrg(org.orgId)
  if (!contact?.email) return fallback
  if (contact.email.toLowerCase() === reporterEmail.toLowerCase()) return fallback

  return { to: contact.email, cc: [reporterEmail], contact }
}
