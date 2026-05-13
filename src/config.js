export const env = {
  zoho: {
    user: process.env.ZOHO_USER,
    pass: process.env.ZOHO_PASS,
    imapHost: process.env.ZOHO_IMAP_HOST || 'imap.zoho.com',
    imapPort: Number(process.env.ZOHO_IMAP_PORT) || 993,
    smtpHost: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    smtpPort: Number(process.env.ZOHO_SMTP_PORT) || 465,
  },
  jira: {
    baseUrl: (process.env.JIRA_BASE_URL || '').replace(/\/$/, ''),
    projectKey: process.env.JIRA_PROJECT_KEY,
    email: process.env.JIRA_EMAIL,
    token: process.env.JIRA_API_TOKEN,
    serviceDeskId: process.env.JIRA_SERVICE_DESK_ID,
    defaultRequestTypeId: process.env.JIRA_DEFAULT_REQUEST_TYPE_ID,
    webhookSecret: process.env.JIRA_WEBHOOK_SECRET,
  },
  ticketKeyPrefix: process.env.TICKET_KEY_PREFIX || 'CST',
}

const required = [
  ['ZOHO_USER', env.zoho.user],
  ['ZOHO_PASS', env.zoho.pass],
  ['JIRA_BASE_URL', env.jira.baseUrl],
  ['JIRA_EMAIL', env.jira.email],
  ['JIRA_API_TOKEN', env.jira.token],
  ['JIRA_SERVICE_DESK_ID', env.jira.serviceDeskId],
  ['JIRA_DEFAULT_REQUEST_TYPE_ID', env.jira.defaultRequestTypeId],
  ['JIRA_WEBHOOK_SECRET', env.jira.webhookSecret],
]

const missing = required.filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.warn(`[config] missing env vars: ${missing.join(', ')}`)
}
