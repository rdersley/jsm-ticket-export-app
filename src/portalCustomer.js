import Resolver from '@forge/resolver';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { listReports, getReport } from './services/reportStore.js';

const resolver = new Resolver();
const queue = new Queue({ key: 'portal-report-queue' });
const CONFIG_PREFIX = 'portal:config:';
const JOB_PREFIX = 'portal:job:';
const JOB_CHUNK_PREFIX = 'portal:job:chunk:';
const LATEST_PREFIX = 'portal:latest:';
const LATEST_CHUNK_PREFIX = 'portal:latest:chunk:';

const configKey = id => `${CONFIG_PREFIX}${id}`;
const jobKey = id => `${JOB_PREFIX}${id}`;
const jobChunkKey = (id, index) => `${JOB_CHUNK_PREFIX}${id}:${index}`;
const latestKey = id => `${LATEST_PREFIX}${id}`;
const latestChunkKey = (id, index) => `${LATEST_CHUNK_PREFIX}${id}:${index}`;

function accountIdFrom(context) {
  const accountId = String(context?.accountId || '').trim();
  if (!accountId) throw new Error('You must be signed in to use portal reports.');
  return accountId;
}

function portalIdFrom(context) {
  const direct = String(context?.extension?.portal?.id || context?.portal?.id || '').trim();
  if (direct) return direct;
  const location = String(context?.extension?.location || context?.location || '').trim();
  const match = location.match(/\/portal\/(\d+)(?:\/|$|\?)/i);
  return match?.[1] || '';
}

async function getConfig(reportId) {
  return (await kvs.get(configKey(reportId))) || {
    reportId,
    enabled: false,
    serviceDeskIds: [],
    accessMode: 'all',
    userAccountIds: [],
    organizationAccountIds: [],
    allowRun: true,
    allowDownload: true
  };
}

async function isAllowed(reportId, context) {
  const config = await getConfig(reportId);
  if (!config.enabled) return { allowed: false, config };

  const portalId = portalIdFrom(context);
  if (config.serviceDeskIds?.length && portalId && !config.serviceDeskIds.includes(portalId)) {
    return { allowed: false, config };
  }

  const accountId = accountIdFrom(context);
  if (config.accessMode !== 'selected') return { allowed: true, config };
  if ((config.userAccountIds || []).includes(accountId)) return { allowed: true, config };
  if ((config.organizationAccountIds || []).includes(accountId)) return { allowed: true, config };
  return { allowed: false, config };
}

async function listPortalReports(context) {
  accountIdFrom(context);
  const reports = await listReports();
  const visible = [];
  for (const report of reports) {
    const access = await isAllowed(report.id, context);
    if (!access.allowed) continue;
    const latest = await kvs.get(latestKey(report.id));
    visible.push({
      id: report.id,
      name: report.name,
      description: report.description || '',
      allowRun: access.config.allowRun !== false,
      allowDownload: access.config.allowDownload !== false && !!latest,
      latest: latest ? {
        generatedAt: latest.generatedAt,
        issueCount: latest.issueCount,
        filename: latest.filename,
        bytes: latest.bytes,
        chunkCount: latest.chunkCount
      } : null
    });
  }
  return visible;
}

async function startJob(reportId, context) {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');
  const ownerAccountId = accountIdFrom(context);
  const access = await isAllowed(reportId, context);
  if (!access.allowed || access.config.allowRun === false) throw new Error('You do not have permission to run this report.');

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  await kvs.set(jobKey(jobId), {
    jobId,
    reportId,
    ownerAccountId,
    state: 'queued',
    adminPublish: false,
    createdAt: now,
    updatedAt: now
  });
  await queue.push({ body: { jobId, reportId, ownerAccountId, adminPublish: false } });
  return { jobId };
}

async function ownedJob(jobId, context) {
  const job = await kvs.get(jobKey(jobId));
  if (!job) return null;
  const accountId = accountIdFrom(context);
  if (job.ownerAccountId !== accountId) throw new Error('This report job belongs to another user.');
  return job;
}

async function cleanupJob(jobId, context) {
  const job = await ownedJob(jobId, context);
  if (!job) return { ok: true };
  for (let i = 0; i < Number(job.chunkCount || 0); i += 1) {
    await kvs.delete(jobChunkKey(jobId, i));
  }
  await kvs.delete(jobKey(jobId));
  return { ok: true };
}

export async function handlePortalAction(action, payload = {}, context = {}) {
  switch (action) {
    case 'portal:list':
      return listPortalReports(context);
    case 'portal:run':
      return startJob(payload.reportId, context);
    case 'portal:job-status':
      return (await ownedJob(payload.jobId, context)) || { state: 'missing' };
    case 'portal:job-cleanup':
      return cleanupJob(payload.jobId, context);
    case 'portal:latest-meta': {
      const access = await isAllowed(payload.reportId, context);
      if (!access.allowed || access.config.allowDownload === false) throw new Error('You do not have permission to download this report.');
      return kvs.get(latestKey(payload.reportId));
    }
    case 'portal:latest-chunk': {
      const access = await isAllowed(payload.reportId, context);
      if (!access.allowed || access.config.allowDownload === false) throw new Error('You do not have permission to download this report.');
      const chunk = await kvs.get(latestChunkKey(payload.reportId, Number(payload.index)));
      if (typeof chunk !== 'string') throw new Error('Published report data is no longer available.');
      return chunk;
    }
    default:
      throw new Error('Unsupported portal action.');
  }
}

resolver.define('portal:list', ({ context }) => listPortalReports(context));
resolver.define('portal:run', ({ payload, context }) => startJob(payload.reportId, context));
resolver.define('portal:job-status', async ({ payload, context }) => (await ownedJob(payload.jobId, context)) || { state: 'missing' });
resolver.define('portal:job-cleanup', ({ payload, context }) => cleanupJob(payload.jobId, context));
resolver.define('portal:latest-meta', async ({ payload, context }) => {
  const access = await isAllowed(payload.reportId, context);
  if (!access.allowed || access.config.allowDownload === false) throw new Error('You do not have permission to download this report.');
  return kvs.get(latestKey(payload.reportId));
});
resolver.define('portal:latest-chunk', async ({ payload, context }) => {
  const access = await isAllowed(payload.reportId, context);
  if (!access.allowed || access.config.allowDownload === false) throw new Error('You do not have permission to download this report.');
  const chunk = await kvs.get(latestChunkKey(payload.reportId, Number(payload.index)));
  if (typeof chunk !== 'string') throw new Error('Published report data is no longer available.');
  return chunk;
});

export const handler = resolver.getDefinitions();
