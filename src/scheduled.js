import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { listReports } from './services/reportStore.js';
import { isDue, runKey } from './services/schedule.js';

const deliveryQueue = new Queue({ key: 'report-export-queue' });

export async function run() {
  const now = new Date();
  const reports = await listReports();
  let queued = 0;

  for (const report of reports) {
    if (!isDue(report, now)) continue;

    const occurrence = runKey(report, now);
    const key = `schedule:last:${report.id}`;
    const previous = await kvs.get(key);
    if (previous?.occurrence === occurrence) continue;

    await kvs.set(key, {
      occurrence,
      status: 'queued',
      queuedAt: now.toISOString()
    });

    try {
      await deliveryQueue.push({
        body: {
          reportId: report.id,
          scheduled: true,
          occurrence
        }
      });
      queued += 1;
    } catch (error) {
      console.error(`Could not queue scheduled report ${report.id}`, error);
      if (previous) await kvs.set(key, previous);
      else await kvs.delete(key);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: reports.length, queued }) };
}

export const handler = run;
