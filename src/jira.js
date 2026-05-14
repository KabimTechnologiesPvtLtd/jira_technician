import { env } from './config.js'

const auth = () =>
  'Basic ' + Buffer.from(`${env.jira.email}:${env.jira.token}`).toString('base64')

const JIRA_TIMEOUT_MS = Number(process.env.JIRA_TIMEOUT_MS) || 30000

async function jiraFetch(path, opts = {}) {
  let res
  try {
    res = await fetch(`${env.jira.baseUrl}${path}`, {
      ...opts,
      headers: {
        Authorization: auth(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(opts.headers || {}),
      },
      signal: AbortSignal.timeout(JIRA_TIMEOUT_MS),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`Jira request timeout after ${JIRA_TIMEOUT_MS}ms ${opts.method || 'GET'} ${path}`)
    }
    throw new Error(`Jira network error ${opts.method || 'GET'} ${path}: ${err.message}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Jira ${res.status} ${opts.method || 'GET'} ${path}: ${body}`)
  }

  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function findCustomerByEmail(email) {
  try {
    const data = await jiraFetch(
      `/rest/servicedeskapi/customer?query=${encodeURIComponent(email)}`
    )
    return (
      data?.values?.find(
        (u) => u.emailAddress?.toLowerCase() === email.toLowerCase()
      ) || null
    )
  } catch {
    return null
  }
}

export async function createCustomer(email, displayName) {
  return jiraFetch('/rest/servicedeskapi/customer', {
    method: 'POST',
    body: JSON.stringify({ email, displayName: displayName || email }),
  })
}

export async function createServiceDeskRequest({
  serviceDeskId,
  requestTypeId,
  summary,
  description,
  reporterEmail,
}) {
  return jiraFetch('/rest/servicedeskapi/request', {
    method: 'POST',
    body: JSON.stringify({
      serviceDeskId: String(serviceDeskId),
      requestTypeId: String(requestTypeId),
      requestFieldValues: { summary, description },
      raiseOnBehalfOf: reporterEmail,
    }),
  })
}

export async function addPublicComment(issueKey, body) {
  return jiraFetch(`/rest/servicedeskapi/request/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body, public: true }),
  })
}

export async function addInternalComment(issueKey, body) {
  return jiraFetch(`/rest/servicedeskapi/request/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body, public: false }),
  })
}

export async function getIssue(issueKey) {
  return jiraFetch(`/rest/api/3/issue/${issueKey}`)
}

export async function addOrganizationToIssue(issueKey, organizationId) {
  return jiraFetch(`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    body: JSON.stringify({
      fields: { customfield_10002: [{ id: String(organizationId) }] },
    }),
  })
}

/**
 * Add labels to an issue without removing existing ones.
 * Used to flag tickets that need triage without polluting the comment stream.
 */
export async function addLabels(issueKey, labels) {
  const arr = (Array.isArray(labels) ? labels : [labels]).filter(Boolean)
  if (arr.length === 0) return
  return jiraFetch(`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    body: JSON.stringify({
      update: { labels: arr.map((label) => ({ add: label })) },
    }),
  })
}
