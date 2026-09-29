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
    const response = await api.asApp().requestJira(route`/rest/api/3/field`);
    const fields = await jsonOrThrow(response, 'Loading Jira fields');
    return fields
      .filter(f => f.id && f.name)
      .map(f => ({ id: f.id, name: f.name, custom: Boolean(f.custom), schema: f.schema?.type || '' }))
      .sort((a,b) => a.name.localeCompare(b.name));
  })(), 8000, FALLBACK_FIELDS);
}

export async function listFilters() {
  return withTimeout((async () => {
    const response = await api.asApp().requestJira(route`/rest/api/3/filter/search?expand=jql&maxResults=100`);
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


// Fields a report creator can offer as Portal Reports customer filters.
const SYSTEM_DATE_FIELDS = { created: 'created', updated: 'updated', resolutiondate: 'resolved', duedate: 'due' };
const SYSTEM_CHOICE_FIELDS = ['status', 'priority', 'resolution', 'issuetype'];
const CHOICE_CUSTOM_TYPES = ['select', 'multiselect', 'radiobuttons', 'multicheckboxes']
  .map(type => `com.atlassian.jira.plugin.system.customfieldtypes:${type}`);
// JSM's request type field is matched by request type name in JQL.
const REQUEST_TYPE_CUSTOM = 'com.atlassian.servicedesk:vp-origin';

export async function listFilterableFields() {
  const response = await api.asApp().requestJira(route`/rest/api/3/field`);
  const fields = await jsonOrThrow(response, 'Loading Jira fields');
  const dateFields = [];
  const choiceFields = [];
  for (const f of fields) {
    if (!f?.id || !f?.name) continue;
    const type = f.schema?.type;
    if (SYSTEM_DATE_FIELDS[f.id]) dateFields.push({ id: SYSTEM_DATE_FIELDS[f.id], name: f.name, custom: false });
    else if (f.custom && (type === 'date' || type === 'datetime')) dateFields.push({ id: f.id, name: f.name, custom: true });
    else if (SYSTEM_CHOICE_FIELDS.includes(f.id)) choiceFields.push({ id: f.id, name: f.name, custom: false });
    else if (f.custom && CHOICE_CUSTOM_TYPES.includes(f.schema?.custom)) choiceFields.push({ id: f.id, name: f.name, custom: true });
    else if (f.custom && f.schema?.custom === REQUEST_TYPE_CUSTOM) choiceFields.push({ id: f.id, name: f.name, custom: true, match: 'name' });
  }
  const byName = (a, b) => Number(a.custom) - Number(b.custom) || a.name.localeCompare(b.name);
  return { dateFields: dateFields.sort(byName), choiceFields: choiceFields.sort(byName) };
}

async function pagedValues(path, label) {
  const values = [];
  let startAt = 0;
  for (let page = 0; page < 20; page += 1) {
    const response = await api.asApp().requestJira(path(startAt));
    const data = await jsonOrThrow(response, label);
    const batch = data.values || [];
    values.push(...batch);
    if (data.isLast !== false || !batch.length) break;
    startAt += batch.length;
  }
  return values;
}

async function isRequestTypeField(fieldId) {
  const fields = await jsonOrThrow(await api.asApp().requestJira(route`/rest/api/3/field`), 'Loading Jira fields');
  return fields.some(f => f.id === fieldId && f.schema?.custom === REQUEST_TYPE_CUSTOM);
}

// One entry per request type name, since JQL matches request types by name.
async function listRequestTypes() {
  const byName = new Map();
  let start = 0;
  for (let page = 0; page < 50; page += 1) {
    const response = await api.asApp().requestJira(route`/rest/servicedeskapi/requesttype?start=${start}&limit=100`, { headers: { Accept: 'application/json' } });
    const data = await jsonOrThrow(response, 'Loading request types');
    const batch = data.values || [];
    for (const t of batch) if (t?.id && t?.name && !byName.has(t.name)) byName.set(t.name, { id: String(t.id), label: t.name, name: t.name });
    if (data.isLastPage !== false || !batch.length) break;
    start += batch.length;
  }
  return [...byName.values()];
}

/** Selectable values for a filterable choice field, as [{ id, label, name? }]. */
export async function listFieldValues(fieldId) {
  const id = String(fieldId || '');
  let values;
  if (id === 'status') {
    const data = await jsonOrThrow(await api.asApp().requestJira(route`/rest/api/3/status`), 'Loading statuses');
    values = data.map(s => ({ id: s.id, label: s.name }));
  } else if (id === 'priority') {
    values = (await pagedValues(startAt => route`/rest/api/3/priority/search?startAt=${startAt}&maxResults=100`, 'Loading priorities'))
      .map(p => ({ id: p.id, label: p.name }));
  } else if (id === 'resolution') {
    values = (await pagedValues(startAt => route`/rest/api/3/resolution/search?startAt=${startAt}&maxResults=100`, 'Loading resolutions'))
      .map(r => ({ id: r.id, label: r.name }));
  } else if (id === 'issuetype') {
    const data = await jsonOrThrow(await api.asApp().requestJira(route`/rest/api/3/issuetype`), 'Loading work types');
    values = data.map(t => ({ id: t.id, label: t.name }));
  } else if (/^customfield_\d+$/.test(id) && await isRequestTypeField(id)) {
    values = await listRequestTypes();
  } else if (/^customfield_\d+$/.test(id)) {
    const contexts = await pagedValues(startAt => route`/rest/api/3/field/${id}/context?startAt=${startAt}&maxResults=50`, 'Loading field contexts');
    values = [];
    for (const context of contexts) {
      const options = await pagedValues(
        startAt => route`/rest/api/3/field/${id}/context/${context.id}/option?startAt=${startAt}&maxResults=100`,
        'Loading field options'
      );
      values.push(...options.filter(o => !o.disabled && !o.optionId).map(o => ({ id: o.id, label: o.value })));
    }
  } else {
    throw new Error('That field cannot be used as a portal filter.');
  }
  const seen = new Map();
  for (const v of values) if (v?.id && !seen.has(String(v.id))) seen.set(String(v.id), { id: String(v.id), label: String(v.label || v.id), ...(v.name ? { name: String(v.name) } : {}) });
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
