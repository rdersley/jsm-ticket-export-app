import { kvs } from '@forge/kvs';
import { listReports } from './services/reportStore.js';
import { isDue, runKey } from './services/schedule.js';
import { runReport } from './services/runner.js';

export async function run() {
  const now = new Date();
  const reports = await listReports();

  for (const report of reports) {
    if (!isDue(report, now)) continue;

    const occurrence = runKey(report, now);
    const key = `schedule:last:${report.id}`;
    const previous = await kvs.get(key);
    if (previous?.occurrence === occurrence) continue;

    await kvs.set(key, { occurrence, status: 'running', startedAt: now.toISOString() });

    try {
      await runReport(report, { delivery: true });
      await kvs.set(key, { occurrence, status: 'success', completedAt: new Date().toISOString() });
    } catch (e) {
      console.error(`Scheduled report ${report.id} failed`, e);
      if (previous) await kvs.set(key, previous);
      else await kvs.delete(key);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: reports.length }) };
}

export const handler = run;
