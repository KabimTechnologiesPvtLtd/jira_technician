import { extractTicketKey, isAutoReply, isLoop } from '../threading.js'
import {
  findCustomerByEmail,
  createCustomer,
  createServiceDeskRequest,
  addPublicComment,
  addOrganizationToIssue,
  addLabels,
} from '../jira.js'
import { findOrgForEmail } from '../orgMapping.js'
import { isMessageProcessed, markMessageProcessed, markConfirmationSent, audit } from '../db.js'
import { render } from '../templates.js'
import { sendMail } from '../mailer.js'
import { env } from '../config.js'
import { firstNameFrom } from '../names.js'

export async function handleInbound(parsed) {
  const messageId = parsed.messageId
  if (!messageId) {
    console.warn('[inbound] missing message-id, skipping')
    return
  }
  if (isMessageProcessed(messageId)) return

  if (isAutoReply(parsed)) {
    audit({
      direction: 'in',
      subject: parsed.subject,
      status: 'skipped:auto-reply',
      detail: messageId,
    })
    markMessageProcessed(messageId, null)
    return
  }

  if (isLoop(parsed, env.zoho.user)) {
    audit({
      direction: 'in',
      subject: parsed.subject,
      status: 'skipped:loop',
      detail: messageId,
    })
    markMessageProcessed(messageId, null)
    return
  }

  const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase()
  const fromName = parsed.from?.value?.[0]?.name || fromAddr
  const subject = parsed.subject || '(no subject)'
  const body = (parsed.text || '').trim() ||
    (parsed.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const existingKey = extractTicketKey(subject)

  // ----- Reply to existing ticket -----
  if (existingKey) {
    try {
      await addPublicComment(existingKey, body || '(empty reply)')
      audit({
        direction: 'in',
        ticketKey: existingKey,
        subject,
        status: 'comment-added',
      })
      markMessageProcessed(messageId, existingKey)
    } catch (err) {
      console.error('[inbound] failed to comment on', existingKey, err)
      throw err
    }
    return
  }

  // ----- New ticket -----
  let customer = await findCustomerByEmail(fromAddr)
  if (!customer) {
    try {
      await createCustomer(fromAddr, fromName)
    } catch (err) {
      // 400 here usually means the customer already exists in another project — non-fatal
      console.warn('[inbound] createCustomer warn for', fromAddr, err.message)
    }
  }

  const created = await createServiceDeskRequest({
    serviceDeskId: env.jira.serviceDeskId,
    requestTypeId: env.jira.defaultRequestTypeId,
    summary: subject,
    description: body || '(no body)',
    reporterEmail: fromAddr,
  })

  const ticketKey = created?.issueKey
  if (!ticketKey) {
    throw new Error('Jira did not return issueKey')
  }

  audit({ direction: 'in', ticketKey, subject, status: 'created' })
  markMessageProcessed(messageId, ticketKey)

  // ----- Org auto-assignment -----
  // On failure or missing mapping, add a label instead of an internal comment.
  // Labels stay out of the customer-facing comment stream and out of the
  // {{issue.comments.last.body}} payload that drives status-change emails.
  const org = findOrgForEmail(fromAddr)
  if (org?.orgId) {
    try {
      await addOrganizationToIssue(ticketKey, org.orgId)
    } catch (err) {
      console.warn('[inbound] org assignment failed for', ticketKey, err.message)
      await addLabels(ticketKey, 'needs-org-assignment').catch(() => {})
    }
  } else {
    console.warn('[inbound] no org mapping for', fromAddr, '- flagged with label')
    await addLabels(ticketKey, 'needs-org-assignment').catch(() => {})
  }

  // ----- Confirmation email -----
  // Mark BEFORE sending so the Jira "Issue Created" webhook (which fires
  // in parallel) sees this ticket as already-confirmed and skips, even
  // if it arrives before the SMTP send below completes.
  markConfirmationSent(ticketKey)
  try {
    const tpl = render('ticket_received', {
      ticketKey,
      customerName: firstNameFrom(fromName, fromAddr),
      summary: subject,
    })
    await sendMail({
      to: fromAddr,
      subject: tpl.subject,
      text: tpl.body,
      ticketKey,
    })
    audit({
      direction: 'out',
      ticketKey,
      subject: tpl.subject,
      status: 'notify:created',
    })
  } catch (err) {
    console.error('[inbound] failed to send confirmation for', ticketKey, err)
  }
}
