import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', 'data', 'org-mapping.json')

let cache = null
let cacheMtime = 0

function load() {
  const stat = fs.statSync(file)
  if (cache && stat.mtimeMs === cacheMtime) return cache
  cache = JSON.parse(fs.readFileSync(file, 'utf8'))
  cacheMtime = stat.mtimeMs
  return cache
}

export function findOrgForEmail(email) {
  if (!email) return null
  const lower = email.toLowerCase()
  const domain = lower.split('@')[1]
  const map = load()
  return map.byEmail?.[lower] || (domain && map.byDomain?.[domain]) || null
}
