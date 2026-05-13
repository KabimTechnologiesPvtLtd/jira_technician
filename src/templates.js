import fs from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(__dirname, '..', 'templates')
const cache = new Map()

function compile(name) {
  const file = path.join(dir, `${name}.hbs`)
  const src = fs.readFileSync(file, 'utf8')
  return Handlebars.compile(src, { noEscape: true })
}

function get(name) {
  if (!cache.has(name)) cache.set(name, compile(name))
  return cache.get(name)
}

/**
 * Render a template. Convention: first non-empty line is the subject,
 * remaining content (after a blank separator line) is the body.
 */
export function render(name, data) {
  const rendered = get(name)(data || {}).replace(/\r\n/g, '\n')
  const lines = rendered.split('\n')

  let subjectIdx = lines.findIndex((l) => l.trim().length > 0)
  if (subjectIdx === -1) {
    return { subject: '(no subject)', body: '' }
  }
  const subject = lines[subjectIdx].trim()
  const body = lines.slice(subjectIdx + 1).join('\n').trim()
  return { subject, body }
}

export function clearCache() {
  cache.clear()
}
