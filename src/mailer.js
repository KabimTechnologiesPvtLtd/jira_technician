import nodemailer from 'nodemailer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logoPath = path.join(__dirname, '..', 'data', 'logo.png')
const hasLogo = fs.existsSync(logoPath)
if (!hasLogo) {
  console.warn('[mailer] data/logo.png not found - emails will send without logo')
}

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 30000

let transporter
function getTransporter() {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: env.zoho.smtpHost,
    port: env.zoho.smtpPort,
    secure: env.zoho.smtpPort === 465,
    auth: { user: env.zoho.user, pass: env.zoho.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  })
  return transporter
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Convert plain-text template output to HTML that survives ALL mail clients.
 * We deliberately do NOT rely on CSS white-space:pre-wrap — Outlook ignores
 * it and collapses newlines/spaces. Emit explicit <br> per line and preserve
 * leading indentation with &nbsp;.
 */
function textToHtml(textBody) {
  return String(textBody || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line)
      const indent = line.match(/^[ \t]+/)
      if (!indent) return escaped
      const pad = indent[0].replace(/\t/g, '    ').length
      return '&nbsp;'.repeat(pad) + escaped.replace(/^[ \t]+/, '')
    })
    .join('<br>')
}

/**
 * Wrap a plain-text body in a branded HTML email shell with the logo at the bottom.
 * The original text is preserved inside a <pre>-styled block so formatting (line breaks,
 * indents in templates) stays intact.
 */
function buildHtml(textBody) {
  const escaped = textToHtml(textBody)
  const logoBlock = hasLogo
    ? `
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eaeaea;text-align:center;">
        <img src="cid:cachedtech-logo" alt="CachedTech" style="max-width:180px;height:auto;display:inline-block;" />
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1d1f;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="font-size:14px;line-height:1.6;word-wrap:break-word;color:#1d1d1f;">${escaped}</div>${logoBlock}
    </div>
  </body>
</html>`
}

export async function sendMail({
  to,
  cc,
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

  const message = {
    from: `"Cached Technology Support" <${env.zoho.user}>`,
    to,
    ...(cc ? { cc } : {}),
    subject,
    text: text || undefined,
    html: html || buildHtml(text || ''),
    headers,
  }

  if (hasLogo) {
    message.attachments = [
      {
        filename: 'cachedtech-logo.png',
        path: logoPath,
        cid: 'cachedtech-logo',
        contentDisposition: 'inline',
      },
    ]
  }

  return getTransporter().sendMail(message)
}
