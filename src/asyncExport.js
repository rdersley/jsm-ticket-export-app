import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { getReport } from './services/reportStore.js';
import { runReport } from './services/runner.js';
import { buildHardwareWeeklyReportV2 } from './services/hardwareWeeklyReportV2.js';

const queue = new Queue({ key: 'report-export-queue' });
const STATUS_PREFIX = 'export:status:';
const CHUNK_PREFIX = 'export:chunk:';
const INDEX_KEY = 'export:index';
const CHUNK_SIZE = 180000;
const MAX_JOBS = 20;

const statusKey = id => `${STATUS_PREFIX}${id}`;
const chunkKey = (id, index) => `${CHUNK_PREFIX}${id}:${index}`;

async function removeJob(jobId, knownStatus = null) {
  const status = knownStatus || await kvs.get(statusKey(jobId));
  const chunkCount = Number(status?.chunkCount || 0);
  await Promise.all(Array.from({ length: chunkCount }, (_, i) => kvs.delete(chunkKey(jobId, i))));
  await kvs.delete(statusKey(jobId));
}

async function createQueuedJob(metadata, body) {
  const jobId = crypto.randomUUID();
  const index = (await kvs.get(INDEX_KEY)) || [];
  const keep = index.slice(-(MAX_JOBS - 1));
  const now = new Date().toISOString();

  // Keep the resolver path deliberately lightweight. Large prior exports can
  // contain many KVS chunks; deleting those synchronously here can exceed the
  // Forge resolver timeout before the new job is even queued. Successful jobs
  // are already removed by cleanupExport after download, so simply trim the
  // active-job index here and leave physical cleanup off the request path.
  await kvs.set(statusKey(jobId), {
    jobId,
    ...metadata,
    state: 'queued',
    createdAt: now,
    updatedAt: now
  });
  await kvs.set(INDEX_KEY, [...keep, jobId]);
  await queue.push({ body: { jobId, ...body } });
  return { jobId };
}

export async function startExport(reportId) {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');
  return createQueuedJob({ reportId, kind: 'saved-report' }, { reportId, kind: 'saved-report' });
}

export async function startHardwareWeeklyExport(config = {}) {
  return createQueuedJob(
    { kind: 'hardware-weekly' },
    { kind: 'hardware-weekly', hardwareConfig: config }
  );
}

export async function getExportStatus(jobId) {
  if (!jobId) throw new Error('Missing export job id.');
  return (await kvs.get(statusKey(jobId))) || { jobId, state: 'missing' };
}

export async function getExportChunk(jobId, index) {
  const safeIndex = Number(index);
  if (!jobId || !Number.isInteger(safeIndex) || safeIndex < 0) throw new Error('Invalid export chunk request.');
  const value = await kvs.get(chunkKey(jobId, safeIndex));
  if (typeof value !== 'string') throw new Error('Export data is no longer available.');
  return value;
}

export async function cleanupExport(jobId) {
  if (!jobId) return { ok: true };
  const status = await kvs.get(statusKey(jobId));
  await removeJob(jobId, status);
  const index = (await kvs.get(INDEX_KEY)) || [];
  await kvs.set(INDEX_KEY, index.filter(id => id !== jobId));
  return { ok: true };
}

async function storeWorkbook(jobId, baseStatus, result, started, fallbackFilename) {
  const base64 = result?.workbookBase64 || '';
  const chunks = [];
  for (let offset = 0; offset < base64.length; offset += CHUNK_SIZE) {
    chunks.push(base64.slice(offset, offset + CHUNK_SIZE));
  }
  for (let i = 0; i < chunks.length; i += 1) {
    await kvs.set(chunkKey(jobId, i), chunks[i]);
  }

  await kvs.set(statusKey(jobId), {
    ...baseStatus,
    jobId,
    state: 'ready',
    filename: result?.filename || fallbackFilename,
    chunkCount: chunks.length,
    issueCount: result?.entry?.issueCount ?? null,
    bytes: result?.entry?.bytes ?? null,
    summary: result?.summary || null,
    counts: result?.counts || null,
    warningCount: Array.isArray(result?.warnings) ? result.warnings.length : 0,
    durationMs: Date.now() - started,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

async function runScheduledDelivery(reportId, occurrence) {
  const key = `schedule:last:${reportId}`;
  try {
    const report = await getReport(reportId);
    if (!report) throw new Error('Report not found.');

    const result = await runReport(report, { delivery: true, history: true, mode: 'scheduled' });
    await kvs.set(key, {
      occurrence,
      status: 'success',
      completedAt: new Date().toISOString(),
      issueCount: result.entry?.issueCount ?? null,
      durationMs: result.entry?.durationMs ?? null
    });
  } catch (error) {
    await kvs.set(key, {
      occurrence,
      status: 'failed',
      failedAt: new Date().toISOString(),
      message: error?.message || 'Scheduled report failed.'
    });
    console.error(`Scheduled report ${reportId} failed`, error);
  }
}

export async function handler(event) {
  const { jobId, reportId, scheduled = false, occurrence = null, kind = 'saved-report', hardwareConfig = null } = event.body || {};

  if (scheduled) {
    if (!reportId) return;
    await runScheduledDelivery(reportId, occurrence);
    return;
  }

  if (!jobId) return;

  const started = Date.now();
  const baseStatus = { jobId, reportId: reportId || null, kind };
  await kvs.set(statusKey(jobId), {
    ...baseStatus,
    state: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    if (kind === 'hardware-weekly') {
      const result = await buildHardwareWeeklyReportV2(hardwareConfig || {});
      await storeWorkbook(jobId, baseStatus, result, started, 'weekly-sd-hardware-report.xlsx');
      return;
    }

    if (!reportId) throw new Error('Missing report id.');
    const report = await getReport(reportId);
    if (!report) throw new Error('Report not found.');
    const result = await runReport(report, { delivery: false, history: true, mode: 'manual' });
    await storeWorkbook(jobId, baseStatus, result, started, `${report.name || 'jira-report'}.xlsx`);
  } catch (error) {
    await kvs.set(statusKey(jobId), {
      ...baseStatus,
      state: 'failed',
      message: error?.message || 'Report generation failed.',
      durationMs: Date.now() - started,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}
