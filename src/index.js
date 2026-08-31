import Resolver from '@forge/resolver';
import { DEFAULT_REPORT } from './domain/defaults.js';
import { listReports, getReport, saveReport, deleteReport } from './services/reportStore.js';
import { listFields, listFilters } from './services/jira.js';
import { getRuns } from './services/runHistory.js';
import { runReport } from './services/runner.js';

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
resolver.define('report:run', async ({ payload }) => runReport(await getReport(payload.id), { delivery: false }));
export const handler = resolver.getDefinitions();
