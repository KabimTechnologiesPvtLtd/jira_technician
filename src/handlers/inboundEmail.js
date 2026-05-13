import { extractTicketKey, isAutoReply, isLoop } from '../threading.js'
import {
  findCustomerByEmail,
  createCustomer,
  createServiceDeskRequest,
  addPublicComment,
  addInternalComment,
  addOrganizationToIssue,
} from '../jira.js'
import { findOrgForEmail } from '../orgMapping.js'
import { isMessageProcessed, markMessageProcessed, audit } from '../db.js'
import { render } from '../templates.js'
import { sendMail } from '../mailer.js'
import { env } from '../config.js'

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
  const org = findOrgForEmail(fromAddr)
  if (org?.orgId) {
    try {
      await addOrganizationToIssue(ticketKey, org.orgId)
    } catch (err) {
      console.warn('[inbound] org assignment failed for', ticketKey, err.message)
      await addInternalComment(
        ticketKey,
        `Auto-assignment to organization ${org.orgId} (${org.name || ''}) failed: ${err.message}`
      ).catch(() => {})
    }
  } else {
    await addInternalComment(
      ticketKey,
      `No organization mapping found for ${fromAddr}. Please assign manually and add the mapping in data/org-mapping.json.`
    ).catch(() => {})
  }

  // ----- Confirmation email -----
  try {
    const tpl = render('ticket_received', {
      ticketKey,
      customerName: fromName,
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
