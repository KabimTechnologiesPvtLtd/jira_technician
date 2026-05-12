import 'dotenv/config'
import { fetchUnseenMail } from '../src/imap.js'
import { handleInbound } from '../src/handlers/inboundEmail.js'

const started = Date.now()

;(async () => {
  try {
    const result = await fetchUnseenMail(handleInbound)
    const elapsed = Date.now() - started
    console.log(
      `[poll] done in ${elapsed}ms processed=${result.processed} failed=${result.failed}`
    )
    process.exit(0)
  } catch (err) {
    console.error('[poll] failed', err)
    process.exit(1)
  }
})()
