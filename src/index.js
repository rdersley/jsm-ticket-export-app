import Resolver from '@forge/resolver';
import { DEFAULT_REPORT } from './domain/defaults.js';
import { listReports, getReport, saveReport, deleteReport } from './services/reportStore.js';
import { listFields, listFilters } from './services/jira.js';
import { getRuns } from './services/runHistory.js';
import { runReport } from './services/runner.js';
import { startExport, getExportStatus, getExportChunk, cleanupExport } from './asyncExport.js';
import { getEmailSettings, saveEmailSettings, sendTestEmail } from './services/email.js';
import { buildHardwareWeeklyReportV2, HARDWARE_WEEKLY_DEFAULTS_V2 } from './services/hardwareWeeklyReportV2.js';

const resolver = new Resolver();
resolver.define('report:list', () => listReports());
resolver.define('report:get', ({ payload }) => getReport(payload.id));
resolver.define('report:new', () => structuredClone(DEFAULT_REPORT));
resolver.define('report:save', ({ payload }) => saveReport(payload.report));
resolver.define('report:delete', async ({ payload }) => { await deleteReport(payload.id); return { ok: true }; });
resolver.define('report:duplicate', async ({ payload }) => {
  const original = await getReport(payload.id); if (!original) throw new Error('Report not found');
  return saveReport({ ...structuredClone(original), id: null, enabled: false, name: `${original.name} (copy)`, createdAt: null, updatedAt: null });
});
resolver.define('jira:fields', () => listFields());
resolver.define('jira:filters', () => listFilters());
resolver.define('report:history', ({ payload }) => getRuns(payload.id));
resolver.define('report:preview', ({ payload }) => runReport(payload.report, { delivery: false, history: false }));
resolver.define('report:run:start', ({ payload }) => startExport(payload.id));
resolver.define('report:run:status', ({ payload }) => getExportStatus(payload.jobId));
resolver.define('report:run:chunk', ({ payload }) => getExportChunk(payload.jobId, payload.index));
resolver.define('report:run:cleanup', ({ payload }) => cleanupExport(payload.jobId));
resolver.define('report:run', async ({ payload }) => runReport(await getReport(payload.id), { delivery: false }));
resolver.define('report:hardware-weekly:defaults', () => structuredClone(HARDWARE_WEEKLY_DEFAULTS_V2));
resolver.define('report:hardware-weekly:run', ({ payload }) => buildHardwareWeeklyReportV2(payload || {}));
resolver.define('report:navigator-export', async ({ payload }) => {
  const template = await getReport(payload.id);
  if (!template) throw new Error('Template not found.');

  const rawKeys = payload.issueKeys;
  const issueKeys = Array.isArray(rawKeys)
    ? rawKeys
    : String(rawKeys || '').split(/[\s,]+/).filter(Boolean);

  let jql = String(payload.jql || '').trim();
  if (issueKeys.length) {
    const safeKeys = issueKeys
      .map(key => String(key).trim())
      .filter(key => /^[A-Z][A-Z0-9_]*-\d+$/i.test(key));
    if (!safeKeys.length) throw new Error('The selected Jira work items could not be read.');
    jql = `key in (${safeKeys.map(key => `"${key.replace(/"/g, '\\"')}"`).join(', ')})`;
  }
  if (!jql) throw new Error('No Jira search query was supplied by the work-item navigator.');

  const report = structuredClone(template);
  report.source = {
    ...(report.source || {}),
    type: issueKeys.length ? 'selected-issues' : 'jql',
    filterId: payload.filterId || null,
    jql,
    maxIssues: 10000
  };
  return runReport(report, { delivery: false, history: true, mode: 'navigator' });
});
resolver.define('email:settings:get', () => getEmailSettings());
resolver.define('email:settings:save', ({ payload }) => saveEmailSettings(payload.settings));
resolver.define('email:test', async ({ payload }) => { await sendTestEmail(payload.address); return { ok: true }; });
export const handler = resolver.getDefinitions();
