import { kvs } from '@forge/kvs';

const INDEX_KEY = 'reports:index';
const key = id => `reports:${id}`;

export async function listReports() {
  const ids = (await kvs.get(INDEX_KEY)) || [];
  const reports = await Promise.all(ids.map(id => kvs.get(key(id))));
  return reports.filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function getReport(id) {
  if (!id) return null;
  return kvs.get(key(id));
}

function normalizeReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Invalid report configuration.');
  const name = String(report.name || '').trim();
  if (!name) throw new Error('Report name is required.');
  const columns = report.template?.columns || [];
  if (!columns.length) throw new Error('Add at least one Excel column.');
  const jql = String(report.source?.jql || '').trim();
  if (!jql) throw new Error('The report needs a JQL query or saved filter.');
  const maxIssues = Math.max(1, Math.min(5000, Number(report.source?.maxIssues || 500)));
  const recipients = [...new Set((report.delivery?.recipients || []).map(x => String(x).trim()).filter(Boolean))];
  const cc = [...new Set((report.delivery?.cc || []).map(x => String(x).trim()).filter(Boolean))];
  if (report.enabled && !recipients.length) throw new Error('Add at least one email recipient before enabling scheduled delivery.');

  return {
    ...report,
    name,
    source: {
      ...report.source,
      type: report.source?.filterId ? 'filter' : 'jql',
      jql,
      maxIssues
    },
    delivery: {
      ...report.delivery,
      recipients,
      cc
    }
  };
}

export async function saveReport(report) {
  const normalized = normalizeReport(report);
  const id = normalized.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const value = { ...normalized, id, createdAt: normalized.createdAt || now, updatedAt: now };
  const ids = (await kvs.get(INDEX_KEY)) || [];
  if (!ids.includes(id)) await kvs.set(INDEX_KEY, [...ids, id]);
  await kvs.set(key(id), value);
  return value;
}

export async function deleteReport(id) {
  const ids = (await kvs.get(INDEX_KEY)) || [];
  await kvs.set(INDEX_KEY, ids.filter(x => x !== id));
  await kvs.delete(key(id));
}
