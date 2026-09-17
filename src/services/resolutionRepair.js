import { searchIssues, getIssueChangelog } from './jira.js';

const DEFAULT_JQL = 'project = HW AND statusCategory = Done AND resolution IS EMPTY';

const csvCell = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const jiraDate = value => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.toISOString().replace(/Z$/, '')}+0000`;
};

async function concurrent(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index], index); }
      catch (error) { output[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, consume));
  return output;
}

function deriveHistoricalResolution(issue, histories) {
  const currentStatus = String(issue?.fields?.status?.name || '').trim();
  const statusChanges = [];

  for (const history of histories || []) {
    const when = new Date(history.created);
    if (!Number.isFinite(when.getTime())) continue;
    for (const item of history?.items || []) {
      if (String(item?.field || '').toLowerCase() !== 'status') continue;
      statusChanges.push({
        when,
        from: String(item?.fromString || '').trim(),
        to: String(item?.toString || '').trim()
      });
    }
  }

  statusChanges.sort((a, b) => a.when - b.when);
  const matchingCurrent = statusChanges.filter(x => x.to.toLowerCase() === currentStatus.toLowerCase());

  if (matchingCurrent.length) {
    const chosen = matchingCurrent.at(-1);
    return {
      resolvedAt: chosen.when,
      derivedFrom: `${chosen.from || '(unknown)'} → ${chosen.to || currentStatus}`,
      needsReview: matchingCurrent.length > 1,
      note: matchingCurrent.length > 1
        ? `Current status was entered ${matchingCurrent.length} times; latest transition used.`
        : 'Latest transition into the current Done-category status.'
    };
  }

  if (statusChanges.length) {
    const chosen = statusChanges.at(-1);
    return {
      resolvedAt: chosen.when,
      derivedFrom: `${chosen.from || '(unknown)'} → ${chosen.to || '(unknown)'}`,
      needsReview: true,
      note: `No transition into current status “${currentStatus || 'unknown'}” was found; latest status transition used as fallback.`
    };
  }

  return {
    resolvedAt: null,
    derivedFrom: '',
    needsReview: true,
    note: 'No status history was available; no historical resolved date could be derived.'
  };
}

export async function buildResolutionRepairCsv(options = {}) {
  const jql = String(options.jql || DEFAULT_JQL).trim();
  const resolutionName = String(options.resolutionName || 'Done').trim() || 'Done';
  const maxIssues = Math.min(10000, Math.max(1, Number(options.maxIssues) || 10000));

  const result = await searchIssues(jql, ['summary', 'status', 'resolution', 'resolutiondate', 'created'], maxIssues);
  const issues = result.issues || [];

  const derived = await concurrent(issues, 8, async issue => {
    const histories = await getIssueChangelog(issue.key, 1000);
    return { issue, ...deriveHistoricalResolution(issue, histories) };
  });

  const rows = [];
  const warnings = [];
  let readyCount = 0;
  let reviewCount = 0;
  let noDateCount = 0;

  for (let i = 0; i < derived.length; i += 1) {
    const item = derived[i];
    const issue = issues[i];
    const summary = issue?.fields?.summary || issue?.key || 'Resolution date repair';
    if (item?.error) {
      reviewCount += 1;
      noDateCount += 1;
      const note = `Could not read changelog: ${item.error.message || item.error}`;
      warnings.push(`${issue?.key || 'Unknown issue'}: ${note}`);
      rows.push([issue?.key || '', summary, '', '', issue?.fields?.status?.name || '', '', 'YES', note]);
      continue;
    }

    const resolved = item.resolvedAt ? jiraDate(item.resolvedAt) : '';
    if (resolved) readyCount += 1;
    else noDateCount += 1;
    if (item.needsReview) reviewCount += 1;

    rows.push([
      item.issue.key,
      item.issue.fields?.summary || item.issue.key,
      resolved ? resolutionName : '',
      resolved,
      item.issue.fields?.status?.name || '',
      item.derivedFrom || '',
      item.needsReview ? 'YES' : 'NO',
      item.note || ''
    ]);
  }

  const header = ['Issue Key', 'Summary', 'Resolution', 'Resolved', 'Current Status', 'Derived From', 'Needs Review', 'Notes'];
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const base64 = Buffer.from(`\uFEFF${csv}`, 'utf8').toString('base64');
  const today = new Date().toISOString().slice(0, 10);

  return {
    workbookBase64: base64,
    filename: `jira-resolution-date-repair-${today}.csv`,
    entry: { issueCount: issues.length, bytes: Buffer.byteLength(csv, 'utf8') },
    summary: {
      scanned: issues.length,
      ready: readyCount,
      needsReview: reviewCount,
      noDate: noDateCount,
      dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
    },
    counts: { sdRows: 0, hwRows: issues.length },
    warnings
  };
}

export const RESOLUTION_REPAIR_DEFAULTS = {
  jql: DEFAULT_JQL,
  resolutionName: 'Done',
  maxIssues: 10000
};
