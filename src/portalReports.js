import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { listReports, getReport } from './services/reportStore.js';
import { runReport } from './services/runner.js';

const resolver = new Resolver();
const queue = new Queue({ key: 'portal-report-queue' });

const CONFIG_PREFIX = 'portal:delivery:';
const JOB_PREFIX = 'portal:delivery-job:';

const configKey = reportId => `${CONFIG_PREFIX}${reportId}`;
const jobKey = jobId => `${JOB_PREFIX}${jobId}`;

const cleanIds = values => [...new Set((values || []).map(v => String(v).trim()).filter(Boolean))];

function normalizeConfig(reportId, config = {}) {
  return {
    reportId,
    enabled: config.enabled === true,
    serviceDeskId: String(config.serviceDeskId || '').trim(),
    userAccountIds: cleanIds(config.userAccountIds),
    updatedAt: new Date().toISOString()
  };
}

async function getConfig(reportId) {
  return (await kvs.get(configKey(reportId))) || normalizeConfig(reportId);
}

async function saveConfig(reportId, config) {
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');
  const value = normalizeConfig(reportId, config);
  await kvs.set(configKey(reportId), value);
  return value;
}

async function requireAdmin(context) {
  const accountId = String(context?.accountId || '').trim();
  if (!accountId) throw new Error('Jira administrator permission is required.');

  const response = await api.asApp().requestJira(route`/rest/api/3/permissions/check`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, globalPermissions: ['ADMINISTER'] })
  });

  if (!response.ok) throw new Error('Jira administrator permission is required.');
  const data = await response.json();
  if (!(data?.globalPermissions || []).includes('ADMINISTER')) {
    throw new Error('Jira administrator permission is required.');
  }
  return accountId;
}

async function listAdminReports() {
  const reports = await listReports();
  return Promise.all(reports.map(async report => ({
    id: report.id,
    name: report.name,
    description: report.description || '',
    config: await getConfig(report.id)
  })));
}

async function listServiceDesks() {
  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/servicedesk?limit=100`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error('Could not load Jira Service Management projects.');
  return (await response.json()).values || [];
}

async function searchCustomers(serviceDeskId, query) {
  const q = String(query || '').trim();
  if (!serviceDeskId) throw new Error('Choose a service project first.');
  if (!q) return [];

  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?query=${q}&start=0&limit=100`,
    { headers: { Accept: 'application/json', 'X-ExperimentalApi': 'opt-in' } }
  );
  if (!response.ok) throw new Error(`Could not search portal customers (${response.status}).`);

  const values = (await response.json()).values || [];
  return values.map(user => ({
    accountId: user.accountId,
    displayName: user.displayName || user.name || user.emailAddress || 'Portal customer',
    emailAddress: user.emailAddress || ''
  })).filter(user => user.accountId);
}

async function listRequestTypes(serviceDeskId) {
  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype?start=0&limit=100`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error(`Could not list request types (${response.status}).`);
  return (await response.json()).values || [];
}

async function requestTypeFields(serviceDeskId, requestTypeId) {
  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) return null;
  return response.json();
}

async function chooseSimpleRequestType(serviceDeskId) {
  const types = await listRequestTypes(serviceDeskId);
  for (const type of types) {
    const meta = await requestTypeFields(serviceDeskId, type.id);
    const fields = meta?.requestTypeFields || [];
    const unsupportedRequired = fields.filter(field =>
      field.required && !['summary', 'description'].includes(String(field.fieldId || ''))
    );
    if (!unsupportedRequired.length) return type;
  }
  return types[0] || null;
}

async function createCustomerRequest(serviceDeskId, requestTypeId, accountId, reportName) {
  const publishedAt = new Date().toISOString();
  const response = await api.asApp().requestJira(route`/rest/servicedeskapi/request`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceDeskId: String(serviceDeskId),
      requestTypeId: String(requestTypeId),
      requestFieldValues: {
        summary: `Published report: ${reportName}`,
        description: `A new Excel report was published for you by your service team on ${publishedAt}.`
      },
      raiseOnBehalfOf: accountId
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    throw new Error(`Could not create customer report request (${response.status}): ${data?.errorMessage || data?.message || raw.slice(0, 180)}`);
  }
  return data;
}

async function uploadTemporary(serviceDeskId, buffer, filename) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  );

  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/attachTemporaryFile`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Atlassian-Token': 'no-check',
        'X-ExperimentalApi': 'opt-in'
      },
      body: form
    }
  );

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`Could not upload report attachment (${response.status}): ${raw.slice(0, 180)}`);

  const item = data?.temporaryAttachments?.[0];
  if (!item?.temporaryAttachmentId) throw new Error('JSM did not return a temporary attachment ID.');
  return item.temporaryAttachmentId;
}

async function publishAttachment(issueKey, temporaryAttachmentId) {
  const response = await api.asApp().requestJira(
    route`/rest/servicedeskapi/request/${issueKey}/attachment`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public: true,
        temporaryAttachmentIds: [temporaryAttachmentId],
        additionalComment: { body: 'Your latest Excel report is attached.' }
      })
    }
  );

  const raw = await response.text();
  if (!response.ok) throw new Error(`Could not publish the report attachment (${response.status}): ${raw.slice(0, 180)}`);
}

async function startPublish(reportId, context) {
  const ownerAccountId = await requireAdmin(context);
  const report = await getReport(reportId);
  if (!report) throw new Error('Report not found.');

  const config = await getConfig(reportId);
  if (!config.enabled) throw new Error('Enable portal delivery for this report first.');
  if (!config.serviceDeskId) throw new Error('Choose a service project first.');
  if (!config.userAccountIds.length) throw new Error('Add at least one portal customer first.');

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  await kvs.set(jobKey(jobId), {
    jobId,
    reportId,
    ownerAccountId,
    state: 'queued',
    createdAt: now,
    updatedAt: now
  });
  await queue.push({ body: { jobId, reportId, ownerAccountId } });
  return { jobId };
}

async function ownedJob(jobId, context) {
  const ownerAccountId = await requireAdmin(context);
  const job = await kvs.get(jobKey(jobId));
  if (!job) return null;
  if (job.ownerAccountId !== ownerAccountId) throw new Error('This publish job belongs to another administrator.');
  return job;
}

export async function portalWorker(event) {
  const { jobId, reportId, ownerAccountId } = event.body || {};
  if (!jobId || !reportId || !ownerAccountId) return;

  const existing = await kvs.get(jobKey(jobId));
  await kvs.set(jobKey(jobId), {
    ...existing,
    state: 'running',
    updatedAt: new Date().toISOString()
  });

  try {
    const report = await getReport(reportId);
    if (!report) throw new Error('Report not found.');

    const config = await getConfig(reportId);
    if (!config.enabled || !config.serviceDeskId || !config.userAccountIds.length) {
      throw new Error('Portal delivery configuration is incomplete.');
    }

    const requestType = await chooseSimpleRequestType(config.serviceDeskId);
    if (!requestType?.id) throw new Error('No usable customer request type was found in the selected service project.');

    const result = await runReport(report, { delivery: false, history: true, mode: 'portal-publish' });
    const workbookBase64 = String(result?.workbookBase64 || '');
    if (!workbookBase64) throw new Error('The report generated without an Excel workbook.');

    const workbook = Buffer.from(workbookBase64, 'base64');
    const safeName = String(report.name || 'Jira report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Jira report';
    const filename = `${safeName}.xlsx`;

    const deliveries = [];
    for (const accountId of config.userAccountIds) {
      try {
        const request = await createCustomerRequest(config.serviceDeskId, requestType.id, accountId, report.name || 'Excel report');
        const issueKey = request?.issueKey || request?.issueId;
        if (!issueKey) throw new Error('JSM created the request without returning its issue key.');

        const temporaryId = await uploadTemporary(config.serviceDeskId, workbook, filename);
        await publishAttachment(issueKey, temporaryId);
        deliveries.push({ accountId, issueKey, ok: true });
      } catch (error) {
        deliveries.push({ accountId, ok: false, message: error?.message || String(error) });
      }
    }

    const failures = deliveries.filter(item => !item.ok);
    if (failures.length === deliveries.length) {
      throw new Error(failures[0]?.message || 'Report delivery failed for every selected customer.');
    }

    await kvs.set(jobKey(jobId), {
      jobId,
      reportId,
      ownerAccountId,
      state: failures.length ? 'ready-with-errors' : 'ready',
      filename,
      issueCount: result?.entry?.issueCount ?? null,
      delivered: deliveries.filter(item => item.ok).length,
      failed: failures.length,
      deliveries,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    await kvs.set(jobKey(jobId), {
      jobId,
      reportId,
      ownerAccountId,
      state: 'failed',
      message: error?.message || 'Portal report publishing failed.',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

resolver.define('portal-admin:list', async ({ context }) => {
  await requireAdmin(context);
  return listAdminReports();
});

resolver.define('portal-admin:service-desks', async ({ context }) => {
  await requireAdmin(context);
  return listServiceDesks();
});

resolver.define('portal-admin:customers', async ({ payload, context }) => {
  await requireAdmin(context);
  return searchCustomers(String(payload?.serviceDeskId || ''), payload?.query);
});

resolver.define('portal-admin:save', async ({ payload, context }) => {
  await requireAdmin(context);
  return saveConfig(payload.reportId, payload.config);
});

resolver.define('portal-admin:publish', async ({ payload, context }) => startPublish(payload.reportId, context));

resolver.define('portal-admin:job-status', async ({ payload, context }) => ownedJob(payload.jobId, context));

resolver.define('portal-admin:job-cleanup', async ({ payload, context }) => {
  const job = await ownedJob(payload.jobId, context);
  if (job) await kvs.delete(jobKey(payload.jobId));
  return { ok: true };
});

export const handler = resolver.getDefinitions();
