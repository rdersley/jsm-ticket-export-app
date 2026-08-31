import { kvs } from '@forge/kvs';
import { listReports } from './services/reportStore.js';
import { isDue, runKey } from './services/schedule.js';
import { runReport } from './services/runner.js';

export async function run() {
  const now = new Date();
  const reports = await listReports();
  for (const report of reports) {
    if (!isDue(report, now)) continue;
    const key = `schedule-run:${runKey(report, now)}`;
    if (await kvs.get(key)) continue;
    await kvs.set(key, { startedAt: now.toISOString() });
    try { await runReport(report, { delivery: true }); }
    catch (e) { console.error(`Scheduled report ${report.id} failed`, e); }
  }
  return { statusCode: 200, body: JSON.stringify({ checked: reports.length }) };
}

export const handler = run;
