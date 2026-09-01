import { searchIssues } from './jira.js';
import { buildWorkbook } from './workbook.js';
import { addRun } from './runHistory.js';
import { sendReportEmail } from './email.js';

function validateReport(report, delivery) {
  if (!report) throw new Error('Report not found.');
  if (!report?.source?.jql?.trim()) throw new Error('The report needs a JQL query or saved filter.');
  if (!(report.template?.columns || []).length) throw new Error('Add at least one Excel column.');
  const maxIssues = Number(report.source?.maxIssues || 500);
  if (!Number.isFinite(maxIssues) || maxIssues < 1 || maxIssues > 5000) {
    throw new Error('Maximum issues must be between 1 and 5000.');
  }
  if (delivery && !(report.delivery?.recipients || []).length) {
    throw new Error('Add at least one email recipient before enabling scheduled delivery.');
  }
  if (delivery && !report.enabled) {
    throw new Error('This report is not enabled for scheduled delivery.');
  }
}

export async function runReport(report, { delivery = false, history = true } = {}) {
  const started = Date.now();
  try {
    validateReport(report, delivery);
    const fields = (report.template.columns || []).map(c => c.fieldId).filter(x => x !== 'key');
    const result = await searchIssues(report.source.jql, fields, Number(report.source?.maxIssues || 500));
    const issues = result.issues || [];
    const buffer = await buildWorkbook(report, issues);
    const workbookBase64 = Buffer.from(buffer).toString('base64');

    if (delivery) await sendReportEmail(report, workbookBase64, issues.length);

    const entry = {
      id: crypto.randomUUID(),
      status: 'success',
      mode: delivery ? 'scheduled' : 'manual',
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
      mode: delivery ? 'scheduled' : 'manual',
      message: error.message,
      durationMs: Date.now() - started,
      at: new Date().toISOString()
    };
    if (history && report?.id) await addRun(report.id, entry);
    throw error;
  }
}
