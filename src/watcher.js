import { fetchUnseenMail } from './imap.js'
import { handleInbound } from './handlers/inboundEmail.js'

const INTERVAL_MS = Number(process.env.IMAP_POLL_INTERVAL_MS) || 60_000

export function startWatcher() {
  console.log(`[watcher] IMAP polling every ${INTERVAL_MS / 1000}s`)

  const run = async () => {
    try {
      const result = await fetchUnseenMail(handleInbound)
      console.log(`[watcher] processed=${result.processed} failed=${result.failed}`)
    } catch (err) {
      console.error('[watcher] poll error', err)
    }
  }

  run()
  setInterval(run, INTERVAL_MS)
}
