import { searchIssues, getSiteUrl, listServiceDeskPortals } from './jira.js';
import { searchFieldIds } from './textFields.js';
import { buildWorkbook } from './workbook.js';
import { addRun } from './runHistory.js';
import { sendReportEmail } from './email.js';

function validateReport(report, delivery) {
  if (!report) throw new Error('Report not found.');
  if (!report?.source?.jql?.trim()) throw new Error('The report needs a JQL query or saved filter.');
  if (!(report.template?.columns || []).length) throw new Error('Add at least one Excel column.');
  const maxIssues = Number(report.source?.maxIssues || 500);
  if (!Number.isFinite(maxIssues) || maxIssues < 1 || maxIssues > 10000) {
    throw new Error('Maximum issues must be between 1 and 10000.');
  }
  if (delivery && !(report.delivery?.recipients || []).length) {
    throw new Error('Add at least one email recipient before enabling scheduled delivery.');
  }
  if (delivery && !report.enabled) {
    throw new Error('This report is not enabled for scheduled delivery.');
  }
}

// Where ticket-key hyperlinks point: the customer portal (default) or Jira.
// If the site address can't be loaded, keys are written without a link rather
// than with an api.atlassian.com link customers can't open.
async function ticketLinkContext(report) {
  const options = report.template?.workbook || {};
  if (options.jiraLinks === false) return null;
  try {
    const baseUrl = await getSiteUrl();
    if (!baseUrl) return null;
    if (options.linkTarget === 'jira') return { baseUrl };
    // Without the service desk list, fall back to Jira links on the site.
    const portalByProjectId = await listServiceDeskPortals().catch(() => null);
    return portalByProjectId ? { baseUrl, portalByProjectId } : { baseUrl };
  } catch {
    return null;
  }
}

export async function runReport(report, { delivery = false, history = true, mode = null } = {}) {
  const started = Date.now();
  const runMode = mode || (delivery ? 'scheduled' : 'manual');
  try {
    validateReport(report, delivery);
    const links = await ticketLinkContext(report);
    const columnFields = searchFieldIds((report.template.columns || []).map(c => c.fieldId).filter(x => x !== 'key'));
    // Portal links need each work item's project to find its service desk.
    const fields = links?.portalByProjectId ? [...new Set([...columnFields, 'project'])] : columnFields;
    const result = await searchIssues(report.source.jql, fields, Number(report.source?.maxIssues || 500));
    const issues = result.issues || [];
    const buffer = await buildWorkbook(report, issues, { links });
    const workbookBase64 = Buffer.from(buffer).toString('base64');

    if (delivery) await sendReportEmail(report, workbookBase64, issues.length);

    const entry = {
      id: crypto.randomUUID(),
      status: 'success',
      mode: runMode,
      issueCount: issues.length,
      bytes: buffer.byteLength,
      durationMs: Date.now() - started,
      at: new Date().toISOString()
    };
    if (history && report.id) await addRun(report.id, entry);
    return { entry, workbookBase64: delivery ? undefined : workbookBase64 };
  } catch (error) {
    const entry = {
      id: crypto.randomUUID(),
      status: 'failed',
      mode: runMode,
      message: error.message,
      durationMs: Date.now() - started,
      at: new Date().toISOString()
    };
    if (history && report?.id) await addRun(report.id, entry);
    throw error;
  }
}
