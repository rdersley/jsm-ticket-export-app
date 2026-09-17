import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { listReports, getReport } from './services/reportStore.js';
import { runReport } from './services/runner.js';

const resolver = new Resolver();
const queue = new Queue({ key: 'portal-report-queue' });
const CONFIG_PREFIX = 'portal:config:';
const JOB_PREFIX = 'portal:job:';
const JOB_CHUNK_PREFIX = 'portal:job:chunk:';
const LATEST_PREFIX = 'portal:latest:';
const LATEST_CHUNK_PREFIX = 'portal:latest:chunk:';
const CHUNK_SIZE = 180000;

const configKey = id => `${CONFIG_PREFIX}${id}`;
const jobKey = id => `${JOB_PREFIX}${id}`;
const jobChunkKey = (id, index) => `${JOB_CHUNK_PREFIX}${id}:${index}`;
const latestKey = id => `${LATEST_PREFIX}${id}`;
const latestChunkKey = (id, index) => `${LATEST_CHUNK_PREFIX}${id}:${index}`;

function cleanIds(values) {
  return [...new Set((values || []).map(v => String(v).trim()).filter(Boolean))];
}

function normalizeConfig(reportId, config = {}) {
  return {
    reportId,
    enabled: config.enabled === true,
    serviceDeskIds: cleanIds(config.serviceDeskIds),
    accessMode: config.accessMode === 'selected' ? 'selected' : 'all',
    userAccountIds: cleanIds(config.userAccountIds),
    organizationIds: cleanIds(config.organizationIds),
    allowRun: config.allowRun !== false,
    allowDownload: config.allowDownload !== false,
    updatedAt: new Date().toISOString()
  };
}

async function getConfig(reportId) {
  return (await kvs.get(configKey(reportId))) || normalizeConfig(reportId, { enabled: false });
}

async function saveConfig(reportId, config) {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');
  const value = normalizeConfig(reportId, config);
  await kvs.set(configKey(reportId), value);
  return value;
}

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

async function requireAdmin() {
  const response = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('Jira administrator permission is required.');
  const data = await response.json();
  if (!data?.permissions?.ADMINISTER?.havePermission) throw new Error('Jira administrator permission is required.');
}

async function organizationIdsForAccount(accountId) {
  try {
    const response = await api.asApp().requestJira(
      route`/rest/servicedeskapi/organization?accountId=${accountId}&limit=100`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return cleanIds((data.values || []).map(org => org.id));
  } catch {
    return [];
  }
}

async function isAllowed(reportId, context, cachedOrgIds = null) {
  const config = await getConfig(reportId);
  if (!config.enabled) return { allowed: false, config };

  const portalId = portalIdFrom(context);
  if (config.serviceDeskIds.length && (!portalId || !config.serviceDeskIds.includes(portalId))) {
    return { allowed: false, config };
  }

  const accountId = accountIdFrom(context);
  if (config.accessMode === 'all') return { allowed: true, config };
  if (config.userAccountIds.includes(accountId)) return { allowed: true, config };

  if (config.organizationIds.length) {
    const accountOrgIds = cachedOrgIds || await organizationIdsForAccount(accountId);
    if (config.organizationIds.some(id => accountOrgIds.includes(String(id)))) {
      return { allowed: true, config };
    }
  }

  return { allowed: false, config };
}

async function listAdminReports() {
  const reports = await listReports();
  return Promise.all(reports.map(async report => ({
    id: report.id,
    name: report.name,
    description: report.description || '',
    maxIssues: report.source?.maxIssues || 500,
    config: await getConfig(report.id),
    latest: await kvs.get(latestKey(report.id))
  })));
}

async function listPortalReports(context) {
  const accountId = accountIdFrom(context);
  const reports = await listReports();
  let accountOrgIds = null;
  const visible = [];
  for (const report of reports) {
    const cfg = await getConfig(report.id);
    if (cfg.accessMode === 'selected' && cfg.organizationIds.length && !cfg.userAccountIds.includes(accountId) && accountOrgIds === null) {
      accountOrgIds = await organizationIdsForAccount(accountId);
    }
    const access = await isAllowed(report.id, context, accountOrgIds || []);
    if (!access.allowed) continue;
    const latest = await kvs.get(latestKey(report.id));
    visible.push({
      id: report.id,
      name: report.name,
      description: report.description || '',
      allowRun: access.config.allowRun,
      allowDownload: access.config.allowDownload && !!latest,
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

async function startJob(reportId, context, adminPublish = false) {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');
  const ownerAccountId = accountIdFrom(context);

  if (!adminPublish) {
    const access = await isAllowed(reportId, context);
    if (!access.allowed || !access.config.allowRun) throw new Error('You do not have permission to run this report.');
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  await kvs.set(jobKey(jobId), {
    jobId,
    reportId,
    ownerAccountId,
    state: 'queued',
    adminPublish,
    createdAt: now,
    updatedAt: now
  });
  await queue.push({ body: { jobId, reportId, ownerAccountId, adminPublish } });
  return { jobId };
}

async function ownedJob(jobId, context) {
  const job = await kvs.get(jobKey(jobId));
  if (!job) return null;
  const accountId = accountIdFrom(context);
  if (job.ownerAccountId !== accountId) throw new Error('This report job belongs to another user.');
  return job;
}

async function removeChunks(prefix, id, count) {
  for (let i = 0; i < Number(count || 0); i += 1) await kvs.delete(`${prefix}${id}:${i}`);
}

async function cleanupJob(jobId, context) {
  const job = await ownedJob(jobId, context);
  if (!job) return { ok: true };
  await removeChunks(JOB_CHUNK_PREFIX, jobId, job.chunkCount);
  await kvs.delete(jobKey(jobId));
  return { ok: true };
}

async function writeLatest(report, base64, entry) {
  const previous = await kvs.get(latestKey(report.id));
  if (previous?.chunkCount) await removeChunks(LATEST_CHUNK_PREFIX, report.id, previous.chunkCount);

  const chunks = [];
  for (let offset = 0; offset < base64.length; offset += CHUNK_SIZE) chunks.push(base64.slice(offset, offset + CHUNK_SIZE));
  for (let i = 0; i < chunks.length; i += 1) await kvs.set(latestChunkKey(report.id, i), chunks[i]);

  const latest = {
    reportId: report.id,
    generatedAt: entry?.at || new Date().toISOString(),
    issueCount: entry?.issueCount ?? null,
    bytes: entry?.bytes ?? null,
    filename: `${report.name || 'jira-report'}.xlsx`,
    chunkCount: chunks.length
  };
  await kvs.set(latestKey(report.id), latest);
  return latest;
}

export async function portalWorker(event) {
  const { jobId, reportId, ownerAccountId, adminPublish = false } = event.body || {};
  if (!jobId || !reportId || !ownerAccountId) return;

  const started = Date.now();
  const existing = await kvs.get(jobKey(jobId));
  await kvs.set(jobKey(jobId), {
    ...existing,
    jobId,
    reportId,
    ownerAccountId,
    adminPublish,
    state: 'running',
    updatedAt: new Date().toISOString()
  });

  try {
    const report = await getReport(reportId);
    if (!report) throw new Error('Report not found.');
    const result = await runReport(report, { delivery: false, history: true, mode: adminPublish ? 'portal-publish' : 'portal' });
    const latest = await writeLatest(report, result.workbookBase64 || '', result.entry);

    for (let i = 0; i < latest.chunkCount; i += 1) {
      const chunk = await kvs.get(latestChunkKey(report.id, i));
      await kvs.set(jobChunkKey(jobId, i), chunk);
    }

    await kvs.set(jobKey(jobId), {
      jobId,
      reportId,
      ownerAccountId,
      adminPublish,
      state: 'ready',
      filename: latest.filename,
      chunkCount: latest.chunkCount,
      issueCount: latest.issueCount,
      bytes: latest.bytes,
      durationMs: Date.now() - started,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    await kvs.set(jobKey(jobId), {
      jobId,
      reportId,
      ownerAccountId,
      adminPublish,
      state: 'failed',
      message: error?.message || 'Portal report generation failed.',
      durationMs: Date.now() - started,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

resolver.define('portal-admin:list', async () => { await requireAdmin(); return listAdminReports(); });
resolver.define('portal-admin:save', async ({ payload }) => { await requireAdmin(); return saveConfig(payload.reportId, payload.config); });
resolver.define('portal-admin:publish', async ({ payload, context }) => { await requireAdmin(); return startJob(payload.reportId, context, true); });
resolver.define('portal-admin:service-desks', async () => {
  await requireAdmin();
  const response = await api.asUser().requestJira(route`/rest/servicedeskapi/servicedesk?limit=100`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not load service projects.');
  return (await response.json()).values || [];
});
resolver.define('portal-admin:customers', async ({ payload }) => {
  await requireAdmin();
  const serviceDeskId = String(payload.serviceDeskId || '').trim();
  const query = String(payload.query || '').trim();
  if (!serviceDeskId || !query) return [];

  const jsmResponse = await api.asUser().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?query=${query}&limit=50`,
    { headers: { Accept: 'application/json', 'X-ExperimentalApi': 'opt-in' } }
  );
  if (jsmResponse.ok) return (await jsmResponse.json()).values || [];

  // Some admins can configure Jira globally but do not have the service-project
  // permission needed by the experimental JSM customer endpoint. Fall back to
  // Jira's user picker in that case, still in the signed-in admin context.
  const pickerResponse = await api.asUser().requestJira(
    route`/rest/api/3/user/picker?query=${query}&maxResults=50`,
    { headers: { Accept: 'application/json' } }
  );
  if (!pickerResponse.ok) {
    const jsmDetail = await jsmResponse.text().catch(() => '');
    const pickerDetail = await pickerResponse.text().catch(() => '');
    throw new Error(`Could not load portal customers (${jsmResponse.status}/${pickerResponse.status})${pickerDetail || jsmDetail ? `: ${(pickerDetail || jsmDetail).slice(0, 180)}` : ''}`);
  }
  const picker = await pickerResponse.json();
  return (picker.users || []).map(user => ({
    accountId: user.accountId,
    displayName: user.displayName || user.emailAddress || user.accountId,
    emailAddress: user.emailAddress || '',
    active: true
  })).filter(user => user.accountId);
});
resolver.define('portal-admin:organizations', async () => {
  await requireAdmin();
  const response = await api.asUser().requestJira(route`/rest/servicedeskapi/organization?limit=100`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Could not load organizations.');
  return (await response.json()).values || [];
});
resolver.define('portal-admin:job-status', async ({ payload, context }) => { await requireAdmin(); return (await ownedJob(payload.jobId, context)) || { state: 'missing' }; });
resolver.define('portal-admin:job-cleanup', async ({ payload, context }) => { await requireAdmin(); return cleanupJob(payload.jobId, context); });

resolver.define('portal:list', ({ context }) => listPortalReports(context));
resolver.define('portal:run', ({ payload, context }) => startJob(payload.reportId, context, false));
resolver.define('portal:job-status', async ({ payload, context }) => (await ownedJob(payload.jobId, context)) || { state: 'missing' });
resolver.define('portal:job-chunk', async ({ payload, context }) => {
  const job = await ownedJob(payload.jobId, context);
  if (!job || job.state !== 'ready') throw new Error('Report is not ready.');
  const chunk = await kvs.get(jobChunkKey(payload.jobId, Number(payload.index)));
  if (typeof chunk !== 'string') throw new Error('Report data is no longer available.');
  return chunk;
});
resolver.define('portal:job-cleanup', ({ payload, context }) => cleanupJob(payload.jobId, context));
resolver.define('portal:latest-meta', async ({ payload, context }) => {
  const access = await isAllowed(payload.reportId, context);
  if (!access.allowed || !access.config.allowDownload) throw new Error('You do not have permission to download this report.');
  return await kvs.get(latestKey(payload.reportId));
});
resolver.define('portal:latest-chunk', async ({ payload, context }) => {
  const access = await isAllowed(payload.reportId, context);
  if (!access.allowed || !access.config.allowDownload) throw new Error('You do not have permission to download this report.');
  const chunk = await kvs.get(latestChunkKey(payload.reportId, Number(payload.index)));
  if (typeof chunk !== 'string') throw new Error('Published report data is no longer available.');
  return chunk;
});

export const handler = resolver.getDefinitions();
