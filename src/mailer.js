import nodemailer from 'nodemailer'
import { env } from './config.js'

let transporter

function getTransporter() {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: env.zoho.smtpHost,
    port: env.zoho.smtpPort,
    secure: env.zoho.smtpPort === 465,
    auth: { user: env.zoho.user, pass: env.zoho.pass },
  })
  return transporter
}

export async function sendMail({
  to,
  subject,
  text,
  html,
  inReplyTo,
  references,
  ticketKey,
}) {
  const headers = {}
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo
  if (references) headers['References'] = references
  if (ticketKey) headers['X-Ticket-Key'] = ticketKey

  return getTransporter().sendMail({
    from: `"CachedTech Support" <${env.zoho.user}>`,
    to,
    subject,
    text,
    html,
    headers,
  })
}
