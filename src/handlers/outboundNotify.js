import { render } from '../templates.js'
import { sendMail } from '../mailer.js'
import { audit } from '../db.js'

const STATUS_TEMPLATE = {
  'Needs Assigned': 'ticket_received',
  'In Progress': 'status_in_progress',
  'Waiting on Client': 'status_waiting_on_client',
  Done: 'status_done',
  Completed: 'status_done',
  Cancelled: 'status_cancelled',
  Canceled: 'status_cancelled',
}

export async function handleStatusChange({
  ticketKey,
  status,
  summary,
  reporterEmail,
  reporterName,
  latestComment,
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
  if (!reporterEmail) {
    audit({
      direction: 'out',
      ticketKey,
      status: 'notify:skipped:no-email',
    })
    return { skipped: true, reason: 'no reporter email' }
  }

  const tpl = render(tplName, {
    ticketKey,
    customerName: reporterName || reporterEmail,
    summary,
    latestComment: latestComment || '',
  })

  await sendMail({
    to: reporterEmail,
    subject: tpl.subject,
    text: tpl.body,
    ticketKey,
  })

  audit({
    direction: 'out',
    ticketKey,
    subject: tpl.subject,
    status: `notify:${status}`,
  })

  return { sent: true }
}

export async function handleAgentComment({
  ticketKey,
  summary,
  reporterEmail,
  reporterName,
  commentBody,
  commentAuthor,
}) {
  if (!reporterEmail) {
    return { skipped: true, reason: 'no reporter email' }
  }
  if (!commentBody || !commentBody.trim()) {
    return { skipped: true, reason: 'empty comment' }
  }

  const tpl = render('agent_reply', {
    ticketKey,
    customerName: reporterName || reporterEmail,
    summary,
    commentBody,
    commentAuthor: commentAuthor || 'CachedTech Support',
  })

  await sendMail({
    to: reporterEmail,
    subject: tpl.subject,
    text: tpl.body,
    ticketKey,
  })

  audit({
    direction: 'out',
    ticketKey,
    subject: tpl.subject,
    status: 'notify:comment',
  })

  return { sent: true }
}
