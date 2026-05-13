import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { env } from './config.js'

export async function fetchUnseenMail(handler) {
  const client = new ImapFlow({
    host: env.zoho.imapHost,
    port: env.zoho.imapPort,
    secure: true,
    auth: { user: env.zoho.user, pass: env.zoho.pass },
    logger: false,
  })

  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  let processed = 0
  let failed = 0

  try {
    for await (const msg of client.fetch(
      { seen: false },
      { source: true, uid: true, envelope: true }
    )) {
      const parsed = await simpleParser(msg.source)
      try {
        await handler(parsed)
        await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true })
        processed++
      } catch (err) {
        failed++
        console.error('[imap] failed uid', msg.uid, err)
        // leave unread; next poll will retry
      }
    }
  } finally {
    lock.release()
    await client.logout()
  }

  return { processed, failed }
}
