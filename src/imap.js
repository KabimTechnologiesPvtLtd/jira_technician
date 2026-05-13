import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { env } from './config.js'

const IMAP_SOCKET_TIMEOUT_MS = Number(process.env.IMAP_SOCKET_TIMEOUT_MS) || 300000  // 5 min

export async function fetchUnseenMail(handler) {
  const client = new ImapFlow({
    host: env.zoho.imapHost,
    port: env.zoho.imapPort,
    secure: true,
    auth: { user: env.zoho.user, pass: env.zoho.pass },
    logger: false,
    socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
  })

  // CRITICAL: attach error listener BEFORE connect() so socket timeouts and
  // other transport errors don't escape as unhandled 'error' events and crash
  // the entire Node process.
  client.on('error', (err) => {
    console.error('[imap] client error event:', err?.message || err)
  })

  let processed = 0
  let failed = 0

  try {
    await client.connect()
  } catch (err) {
    console.error('[imap] connect failed:', err.message)
    return { processed, failed }
  }

  let lock
  try {
    lock = await client.getMailboxLock('INBOX')
  } catch (err) {
    console.error('[imap] mailbox lock failed:', err.message)
    await client.logout().catch(() => {})
    return { processed, failed }
  }

  // Phase 1: fetch all unread sources into memory, then release IMAP fast.
  // Doing the slow Jira/SMTP work inside the fetch loop holds the IMAP socket
  // open and eventually trips the server-side idle timeout.
  const messages = []
  try {
    for await (const msg of client.fetch(
      { seen: false },
      { source: true, uid: true, envelope: true }
    )) {
      messages.push({ uid: msg.uid, source: msg.source })
    }
  } catch (err) {
    console.error('[imap] fetch failed:', err.message)
  } finally {
    try { lock.release() } catch {}
  }

  // Phase 2: process each message (slow work) with IMAP idle. We'll reopen
  // the connection later only to flag the successful UIDs as Seen.
  const seenUids = []
  for (const { uid, source } of messages) {
    try {
      const parsed = await simpleParser(source)
      await handler(parsed)
      seenUids.push(uid)
      processed++
    } catch (err) {
      failed++
      console.error('[imap] handler failed for uid', uid, ':', err.message)
      // leave unread so next poll retries
    }
  }

  // Phase 3: flag the processed messages as Seen so the next poll skips them.
  if (seenUids.length > 0) {
    try {
      for (const uid of seenUids) {
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
      }
    } catch (err) {
      // Not fatal — next poll will reprocess, idempotency table in db.js will
      // catch duplicates by message-id.
      console.error('[imap] mark-seen failed:', err.message)
    }
  }

  try {
    await client.logout()
  } catch {}

  return { processed, failed }
}
