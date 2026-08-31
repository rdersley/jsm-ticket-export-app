import { kvs } from '@forge/kvs';

const historyKey = reportId => `history:${reportId}`;
export async function addRun(reportId, entry) {
  const current = (await kvs.get(historyKey(reportId))) || [];
  await kvs.set(historyKey(reportId), [entry, ...current].slice(0, 100));
}
export async function getRuns(reportId) { return (await kvs.get(historyKey(reportId))) || []; }
