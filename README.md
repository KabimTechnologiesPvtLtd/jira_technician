# CachedTech Support Middleware

Bridges `support@cachedtech.com` (Zoho Mail) with Jira Service Management:

- **Inbound**: cron job polls Zoho IMAP. New mail -> create Jira ticket (or comment on existing one if subject contains `[CST-XXX]`).
- **Outbound**: Jira automation rules POST to `/jira-webhook` on status changes and public comments. Middleware renders a Handlebars template and sends via Zoho SMTP, so all customer mail genuinely originates from `support@cachedtech.com`.
- **Threading**: subject is always tagged `[CST-XXX]`, plus standard `In-Reply-To` / `References` headers, so replies attach to the right ticket in Jira and thread cleanly in the customer's inbox.

## Quick start

```bash
npm install
cp .env.example .env
# fill in .env (see "Setup" below)
npm start            # runs the Express webhook server (Passenger entry on cPanel)
npm run poll         # runs one IMAP fetch cycle (wire this to cron)
```

## Setup checklist

### Zoho
1. Settings -> Mail Accounts -> IMAP Access -> **enable**
2. https://accounts.zoho.com/home#security/app_passwords -> generate password -> `ZOHO_PASS`
3. Confirm regional host (US/EU/IN/AU) and update `ZOHO_IMAP_HOST` / `ZOHO_SMTP_HOST` if needed

### Jira
1. https://id.atlassian.com/manage-profile/security/api-tokens -> create token -> `JIRA_API_TOKEN`
2. Find service desk id:
   ```
   curl -u $JIRA_EMAIL:$JIRA_API_TOKEN $JIRA_BASE_URL/rest/servicedeskapi/servicedesk
   ```
   -> `JIRA_SERVICE_DESK_ID`
3. Find default request type id:
   ```
   curl -u $JIRA_EMAIL:$JIRA_API_TOKEN $JIRA_BASE_URL/rest/servicedeskapi/servicedesk/{id}/requesttype
   ```
   -> `JIRA_DEFAULT_REQUEST_TYPE_ID`
4. Project Settings -> Customer notifications -> **disable** "Request created", "Request resolved", "Public comment added" (middleware sends these)
5. Project Settings -> Automation -> create rules per status (see "Jira automation" below)

### cPanel
1. Setup Node.js App -> create app, root = this folder, startup file = `app.js`, mode = production
2. Add every env var from `.env.example`
3. Run NPM Install -> Restart
4. Hit `/health` to confirm
5. Cron Jobs -> `*/2 * * * *` running `cron/poll-imap.js` via the venv node binary
6. Subdomain (e.g. `api.cachedtech.com`) with AutoSSL enabled

## Jira automation rule payloads

For **status transitions**, configure a "Send web request" action with:

```json
{
  "webhookId": "{{rule.id}}-{{issue.key}}-{{now}}",
  "eventType": "status",
  "ticketKey": "{{issue.key}}",
  "status": "{{issue.status.name}}",
  "summary": "{{issue.summary}}",
  "reporterEmail": "{{reporter.emailAddress}}",
  "reporterName": "{{reporter.displayName}}",
  "latestComment": "{{issue.comments.last.body}}"
}
```

For **public comments by an agent** (so the customer gets the reply via support@cachedtech.com):

```json
{
  "webhookId": "{{rule.id}}-{{issue.key}}-{{comment.id}}",
  "eventType": "comment",
  "ticketKey": "{{issue.key}}",
  "summary": "{{issue.summary}}",
  "reporterEmail": "{{reporter.emailAddress}}",
  "reporterName": "{{reporter.displayName}}",
  "commentBody": "{{comment.body}}",
  "commentAuthor": "{{comment.author.displayName}}"
}
```

Both must include header `x-webhook-secret: <JIRA_WEBHOOK_SECRET>`.

Add a condition on the comment rule: `comment.author.accountId != reporter.accountId` so customer replies don't echo back to themselves.

## File map

| Path | Purpose |
| --- | --- |
| `app.js` | Express entry (Passenger uses this) |
| `cron/poll-imap.js` | Cron-triggered IMAP fetch |
| `src/imap.js` | Zoho IMAP client |
| `src/mailer.js` | Zoho SMTP client |
| `src/jira.js` | Jira REST API wrapper |
| `src/handlers/inboundEmail.js` | Parses email, creates ticket or adds comment |
| `src/handlers/outboundNotify.js` | Renders template, sends via SMTP |
| `src/routes/jiraWebhook.js` | POST /jira-webhook |
| `src/templates.js` | Handlebars renderer (first line = subject) |
| `src/threading.js` | Subject parsing + auto-reply detection |
| `src/orgMapping.js` | Email -> Jira organization lookup |
| `src/db.js` | SQLite for idempotency + audit |
| `templates/*.hbs` | Email templates |
| `data/org-mapping.json` | Customer -> organization mapping |
| `data/middleware.db` | SQLite (auto-created, gitignored) |
