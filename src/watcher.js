import { fetchUnseenMail } from './imap.js'
import { handleInbound } from './handlers/inboundEmail.js'

const intervalMs = Number(process.env.IMAP_POLL_INTERVAL_MS) || 60000
const maxPollMs = Number(process.env.IMAP_POLL_MAX_MS) || 5 * 60 * 1000  // 5 min hard cap

let running = false
let runningSince = 0
let timer = null
let pollCount = 0

async function pollOnce() {
  // Safety: if a previous poll has been "running" for longer than maxPollMs,
  // assume it's wedged and let this tick proceed anyway. Without this, a single
  // hung poll would block every future tick forever.
  if (running) {
    const stuckFor = Date.now() - runningSince
    if (stuckFor < maxPollMs) {
      console.warn('[watcher] previous poll still running, skipping this tick')
      return
    }
    console.error(`[watcher] previous poll stuck for ${stuckFor}ms - forcing reset and continuing`)
  }

  running = true
  runningSince = Date.now()
  pollCount++
  const t0 = Date.now()

  try {
    const result = await fetchUnseenMail(handleInbound)
    const elapsed = Date.now() - t0
    if (result.processed > 0 || result.failed > 0) {
      console.log(
        `[watcher] poll #${pollCount} in ${elapsed}ms processed=${result.processed} failed=${result.failed}`
      )
    }
  } catch (err) {
    console.error(`[watcher] poll #${pollCount} failed:`, err?.message || err)
  } finally {
    running = false
  }
}

export function startWatcher() {
  console.log(`[watcher] starting IMAP poll every ${intervalMs}ms (max ${maxPollMs}ms per poll)`)
  pollOnce()
  timer = setInterval(pollOnce, intervalMs)
}

export function stopWatcher() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
