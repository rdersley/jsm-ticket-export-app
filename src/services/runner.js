import { searchIssues } from './jira.js';
import { buildWorkbook } from './workbook.js';
import { addRun } from './runHistory.js';

export async function runReport(report, { delivery = false, history = true } = {}) {
  const started = Date.now();
  try {
    if (!report?.source?.jql?.trim()) throw new Error('The report needs a JQL query or saved filter.');
    if (!(report.template?.columns || []).length) throw new Error('Add at least one Excel column.');
    const fields = (report.template.columns || []).map(c => c.fieldId).filter(x => x !== 'key');
    const result = await searchIssues(report.source.jql, fields, report.source?.maxIssues || 500);
    const issues = result.issues || [];
    const buffer = await buildWorkbook(report, issues);

    if (delivery) throw new Error('Email provider has not been configured for this installation yet.');

    const entry = { id: crypto.randomUUID(), status: 'success', mode: delivery ? 'scheduled' : 'manual', issueCount: issues.length, bytes: buffer.byteLength, durationMs: Date.now()-started, at: new Date().toISOString() };
    if (history && report.id) await addRun(report.id, entry);
    return { entry, workbookBase64: Buffer.from(buffer).toString('base64') };
  } catch (error) {
    const entry = { id: crypto.randomUUID(), status: 'failed', mode: delivery ? 'scheduled' : 'manual', message: error.message, durationMs: Date.now()-started, at: new Date().toISOString() };
    if (history && report?.id) await addRun(report.id, entry);
    throw error;
  }
}
