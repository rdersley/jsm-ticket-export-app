import api, { route } from '@forge/api';

async function jsonOrThrow(response, label) {
  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const messages = [
            ...(Array.isArray(parsed?.errorMessages) ? parsed.errorMessages : []),
            ...Object.entries(parsed?.errors || {}).map(([field, message]) => `${field}: ${message}`),
            parsed?.message
          ].filter(Boolean);
          detail = messages.length ? messages.join(' | ') : text;
        } catch {
          detail = text;
        }
      }
    } catch {}
    throw new Error(`${label} failed (${response.status})${detail ? `: ${detail.slice(0, 800)}` : ''}`);
  }
  return response.json();
}

async function withTimeout(work, milliseconds, fallbackValue) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(work).catch(() => fallbackValue),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(fallbackValue), milliseconds);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const FALLBACK_FIELDS = [
  ['key', 'Key'],
  ['summary', 'Summary'],
  ['status', 'Status'],
  ['assignee', 'Assignee'],
  ['reporter', 'Reporter'],
  ['priority', 'Priority'],
  ['created', 'Created'],
  ['updated', 'Updated'],
  ['resolution', 'Resolution'],
  ['resolutiondate', 'Resolution date']
].map(([id, name]) => ({ id, name, custom: false, schema: '' }));

export async function listFields() {
  return withTimeout((async () => {
    const response = await api.asUser().requestJira(route`/rest/api/3/field`);
    const fields = await jsonOrThrow(response, 'Loading Jira fields');
    return fields
      .filter(f => f.id && f.name)
      .map(f => ({ id: f.id, name: f.name, custom: Boolean(f.custom), schema: f.schema?.type || '' }))
      .sort((a,b) => a.name.localeCompare(b.name));
  })(), 8000, FALLBACK_FIELDS);
}

export async function listFilters() {
  return withTimeout((async () => {
    const response = await api.asUser().requestJira(route`/rest/api/3/filter/search?expand=jql&maxResults=100`);
    const data = await jsonOrThrow(response, 'Loading saved filters');
    return (data.values || []).map(f => ({ id: String(f.id), name: f.name, jql: f.jql || '', favourite: Boolean(f.favourite) }));
  })(), 8000, []);
}

export async function searchIssues(jql, fieldIds, maxIssues = 500, label = 'Searching Jira issues') {
  const issues = [];
  let nextPageToken;
  const fields = [...new Set(['summary', ...fieldIds.filter(Boolean)])];
  while (issues.length < maxIssues) {
    const body = { jql: jql || 'ORDER BY created DESC', fields, maxResults: Math.min(100, maxIssues - issues.length) };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await jsonOrThrow(response, label);
    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    if (!nextPageToken || !(data.issues || []).length) break;
  }
  return { issues, total: issues.length };
}

export async function getIssueChangelog(issueKey, maxItems = 500) {
  const histories = [];
  let startAt = 0;
  const pageSize = Math.min(100, Math.max(1, Number(maxItems) || 500));

  while (histories.length < maxItems) {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=${Math.min(pageSize, maxItems - histories.length)}`
    );
    const data = await jsonOrThrow(response, `Loading changelog for ${issueKey}`);
    const values = data.values || [];
    histories.push(...values);
    if (!values.length || histories.length >= Number(data.total || 0)) break;
    startAt += values.length;
  }

  return histories.slice(0, maxItems);
}
