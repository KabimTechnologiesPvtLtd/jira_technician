/**
 * Best-effort extraction of a first name to address customers warmly.
 * Falls back through display-name -> email local-part -> "there".
 */
export function firstNameFrom(displayName, email) {
  if (displayName) {
    // Strip any embedded address like "John Doe <john@example.com>"
    const cleaned = displayName.replace(/<[^>]*>/g, '').trim()
    if (
      cleaned &&
      !cleaned.includes('@') &&
      cleaned.toLowerCase() !== (email || '').toLowerCase()
    ) {
      const first = cleaned.split(/\s+/)[0]
      if (first) return first
    }
  }

  if (email) {
    const local = email.split('@')[0] || ''
    const first = local.split(/[.\-_+]/)[0]
    if (first && first.length > 0) {
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
    }
  }

  return 'there'
}
