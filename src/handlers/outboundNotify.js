import { render } from '../templates.js'
import { sendMail } from '../mailer.js'
import { audit, wasConfirmationSent, markConfirmationSent } from '../db.js'
import { firstNameFrom } from '../names.js'

const STATUS_TEMPLATE = {
  'Needs Assigned': 'ticket_received',
  'In Progress': 'status_in_progress',
  'Waiting on Client': 'status_waiting_on_client',
  Done: 'status_done',
  Completed: 'status_done',
  Cancelled: 'status_cancelled',
  Canceled: 'status_cancelled',
}

/**
 * Decide who a customer-facing email goes to.
 *
 * Primary recipient is the assigned Contact (the on-site person the ticket is
 * actually for). The Reporter is usually a dispatcher (e.g. Jimmy) who logs
 * tickets on behalf of many sites, so they're CC'd to stay in the loop.
 *
 * When no Contact is assigned yet (fresh ticket, or unknown sender) we fall
 * back to the reporter so the customer still hears back.
 */
function resolveRecipients({
  contactEmail,
  contactName,
  reporterEmail,
  reporterName,
}) {
  const contact = (contactEmail || '').trim()
  const reporter = (reporterEmail || '').trim()

  if (contact) {
    const cc =
      reporter && reporter.toLowerCase() !== contact.toLowerCase()
        ? reporter
        : undefined
    return {
      to: contact,
      cc,
      greetingName: firstNameFrom(contactName, contact),
    }
  }

  // No contact assigned — send to whoever raised the ticket.
  return {
    to: reporter || undefined,
    cc: undefined,
    greetingName: firstNameFrom(reporterName, reporter),
  }
}

export async function handleStatusChange({
  ticketKey,
  status,
  summary,
  reporterEmail,
  reporterName,
  contactEmail,
  contactName,
}) {
  const tplName = STATUS_TEMPLATE[status]
  if (!tplName) {
    audit({
      direction: 'out',
      ticketKey,
      status: `notify:skipped:${status}`,
    })
    return { skipped: true, reason: 'no template for status' }
  }

  const { to, cc, greetingName } = resolveRecipients({
    contactEmail,
    contactName,
    reporterEmail,
    reporterName,
  })

  if (!to) {
    audit({
      direction: 'out',
      ticketKey,
      status: 'notify:skipped:no-email',
    })
    return { skipped: true, reason: 'no recipient email' }
  }

  // Dedupe: if the inbound-email path already sent the ticket_received
  // for this ticket, don't send it again from the Issue-Created webhook.
  if (tplName === 'ticket_received' && wasConfirmationSent(ticketKey)) {
    audit({
      direction: 'out',
      ticketKey,
      status: 'notify:skipped:already-sent',
    })
    return { skipped: true, reason: 'confirmation already sent' }
  }

  const tpl = render(tplName, {
    ticketKey,
    customerName: greetingName,
    summary,
  })

  await sendMail({
    to,
    cc,
    subject: tpl.subject,
    text: tpl.body,
    ticketKey,
  })

  if (tplName === 'ticket_received') {
    markConfirmationSent(ticketKey)
  }

  audit({
    direction: 'out',
    ticketKey,
    subject: tpl.subject,
    status: `notify:${status}`,
    detail: cc ? `to=${to} cc=${cc}` : `to=${to}`,
  })

  return { sent: true, to, cc }
}

export async function handleAgentComment({
  ticketKey,
  summary,
  reporterEmail,
  reporterName,
  contactEmail,
  contactName,
  commentBody,
  commentAuthor,
}) {
  const { to, cc, greetingName } = resolveRecipients({
    contactEmail,
    contactName,
    reporterEmail,
    reporterName,
  })

  if (!to) {
    return { skipped: true, reason: 'no recipient email' }
  }
  if (!commentBody || !commentBody.trim()) {
    return { skipped: true, reason: 'empty comment' }
  }

  const tpl = render('agent_reply', {
    ticketKey,
    customerName: greetingName,
    summary,
    commentBody,
    commentAuthor: commentAuthor || 'Cached Technology Support',
  })

  await sendMail({
    to,
    cc,
    subject: tpl.subject,
    text: tpl.body,
    ticketKey,
  })

  audit({
    direction: 'out',
    ticketKey,
    subject: tpl.subject,
    status: 'notify:comment',
    detail: cc ? `to=${to} cc=${cc}` : `to=${to}`,
  })

  return { sent: true, to, cc }
}
