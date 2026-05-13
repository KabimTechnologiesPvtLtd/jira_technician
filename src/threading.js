import { env } from './config.js'

const ticketRegex = new RegExp(`\\[(${env.ticketKeyPrefix})-(\\d+)\\]`, 'i')

export function extractTicketKey(subject) {
  if (!subject) return null
  const m = subject.match(ticketRegex)
  return m ? `${env.ticketKeyPrefix}-${m[2]}` : null
}

export function isAutoReply(parsed) {
  const headers = parsed.headers
  const autoSubmitted = headers.get('auto-submitted')
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (headers.get('x-autoreply')) return true
  if (headers.get('x-autorespond')) return true
  if (headers.get('precedence') === 'auto_reply') return true
  if (headers.get('precedence') === 'bulk') return true

  const subj = (parsed.subject || '').toLowerCase()
  if (/^(out of office|automatic reply|auto[- ]?reply|vacation|away)/i.test(subj)) {
    return true
  }
  return false
}

/** Avoid creating tickets from our own outbound mail or noreply senders. */
export function isLoop(parsed, ourAddress) {
  const from = parsed.from?.value?.[0]?.address?.toLowerCase()
  if (!from) return true
  if (ourAddress && from === ourAddress.toLowerCase()) return true
  if (/(no[-]?reply|do[-]?not[-]?reply|mailer[-]?daemon|postmaster)@/i.test(from)) {
    return true
  }
  return false
}
