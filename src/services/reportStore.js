import { kvs } from '@forge/kvs';

const INDEX_KEY = 'reports:index';
const key = id => `reports:${id}`;

export async function listReports() {
  const ids = (await kvs.get(INDEX_KEY)) || [];
  const reports = await Promise.all(ids.map(id => kvs.get(key(id))));
  return reports.filter(Boolean);
}

export async function getReport(id) { return kvs.get(key(id)); }

export async function saveReport(report) {
  const id = report.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const value = { ...report, id, createdAt: report.createdAt || now, updatedAt: now };
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
