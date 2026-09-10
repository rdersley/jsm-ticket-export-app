import { kvs } from '@forge/kvs';

const INDEX_KEY = 'reports:index';
const key = id => `reports:${id}`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function listReports() {
  const ids = (await kvs.get(INDEX_KEY)) || [];
  const reports = await Promise.all(ids.map(id => kvs.get(key(id))));
  return reports.filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function getReport(id) {
  if (!id) return null;
  return kvs.get(key(id));
}

function validTimezone(value) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

function normalizeEmails(values, label) {
  const emails = [...new Set((values || []).map(x => String(x).trim()).filter(Boolean))];
  const invalid = emails.find(x => !EMAIL.test(x));
  if (invalid) throw new Error(`${label} contains an invalid email address: ${invalid}`);
  return emails;
}

function normalizeReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Invalid report configuration.');
  const name = String(report.name || '').trim();
  if (!name) throw new Error('Report name is required.');
  const columns = report.template?.columns || [];
  if (!columns.length) throw new Error('Add at least one Excel column.');
  const duplicateField = columns.map(c => c.fieldId).find((id, i, all) => all.indexOf(id) !== i);
  if (duplicateField) throw new Error(`The field ${duplicateField} is included more than once.`);
  const jql = String(report.source?.jql || '').trim();
  if (!jql) throw new Error('The report needs a JQL query or saved filter.');
  const maxIssues = Math.max(1, Math.min(10000, Number(report.source?.maxIssues || 500)));
  const recipients = normalizeEmails(report.delivery?.recipients, 'Recipients');
  const cc = normalizeEmails(report.delivery?.cc, 'CC');

  const schedule = { ...report.schedule };
  const frequencies = ['daily','weekdays','weekly','monthly'];
  if (!frequencies.includes(schedule.frequency)) schedule.frequency = 'weekly';
  if (!TIME.test(String(schedule.time || ''))) throw new Error('Schedule time must be a valid 24-hour time.');
  schedule.timezone = String(schedule.timezone || 'UTC').trim();
  if (!validTimezone(schedule.timezone)) throw new Error(`Unknown timezone: ${schedule.timezone}`);
  schedule.weekday = Math.max(0, Math.min(6, Number(schedule.weekday ?? 1)));
  schedule.monthDay = Math.max(1, Math.min(28, Number(schedule.monthDay || 1)));
  if (report.enabled && !recipients.length) throw new Error('Add at least one email recipient before enabling scheduled delivery.');

  const workbook = { ...(report.template?.workbook || {}) };
  workbook.sheetName = String(workbook.sheetName || 'Issues').trim() || 'Issues';
  workbook.dateFormat = String(workbook.dateFormat || 'dd/mm/yyyy hh:mm').trim() || 'dd/mm/yyyy hh:mm';
  workbook.orientation = workbook.orientation === 'portrait' ? 'portrait' : 'landscape';

  return {
    ...report,
    name,
    description: String(report.description || '').trim(),
    source: { ...report.source, type: report.source?.filterId ? 'filter' : 'jql', jql, maxIssues },
    template: { ...report.template, columns, workbook },
    schedule,
    delivery: { ...report.delivery, recipients, cc }
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
