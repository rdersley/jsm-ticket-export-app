import ExcelJS from 'exceljs';
import { searchIssues, getIssueChangelog } from './jira.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;

export const HARDWARE_WEEKLY_DEFAULTS_V2 = {
  sdProjectKey: 'SD',
  hwProjectKey: 'HW',
  sdJql: 'project = SD',
  hwJql: 'project = HW',
  dateSentFieldId: 'customfield_10433',
  clientFieldId: '',
  receivedStatuses: [],
  awaitingDispatchStatuses: [],
  awaitingReturnStatuses: [],
  maxIssues: 5000
};

const quote = value => `"${String(value || '').replace(/"/g, '\\"')}"`;
const cleanBaseJql = (value, fallback) => String(value || fallback || '').trim().replace(/\s+ORDER\s+BY[\s\S]*$/i, '').trim();
const asDate = value => value ? new Date(value) : null;
const lowerList = values => (values || []).map(v => String(v).trim().toLowerCase()).filter(Boolean);
const statusName = issue => String(issue?.fields?.status?.name || '');
const display = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(', ');
  if (value.child?.value != null && value.value != null) return `${value.value} - ${value.child.value}`;
  return value.value ?? value.name ?? value.displayName ?? value.key ?? JSON.stringify(value);
};

export function nextDayV2(value) {
  if (!DATE_ONLY.test(String(value || ''))) throw new Error('Report dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return new Date(date).toISOString().slice(0, 10);
}

export function linkedKeysV2(issue) {
  const output = [];
  for (const link of issue?.fields?.issuelinks || []) {
    const key = String((link?.outwardIssue || link?.inwardIssue)?.key || '').toUpperCase();
    if (JIRA_KEY.test(key) && !output.includes(key)) output.push(key);
  }
  return output;
}

export function receivedDateV2(histories, configured = []) {
  const wanted = lowerList(configured);
  const matches = [];
  for (const history of histories || []) {
    for (const item of history?.items || []) {
      if (String(item?.field || '').toLowerCase() !== 'status') continue;
      const target = String(item?.toString || '').trim().toLowerCase();
      const match = wanted.length
        ? wanted.includes(target)
        : /(receiv|returned?|device.*back|back.*device)/i.test(target);
      if (!match) continue;
      const when = new Date(history.created);
      if (Number.isFinite(when.getTime())) matches.push(when);
    }
  }
  matches.sort((a, b) => a - b);
  return matches[0] || null;
}

const inRange = (value, start, endExclusive) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start.getTime() && time < endExclusive.getTime();
};

const mergeIssues = (...groups) => {
  const map = new Map();
  for (const issue of groups.flat()) if (issue?.key) map.set(issue.key, issue);
  return [...map.values()];
};

async function concurrent(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index], index); }
      catch (error) { output[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, consume));
  return output;
}

export function buildDualJqlV2(config, startDate, endExclusive) {
  const sdBase = cleanBaseJql(config.sdJql, `project = ${quote(config.sdProjectKey)}`);
  const hwBase = cleanBaseJql(config.hwJql, `project = ${quote(config.hwProjectKey)}`);
  if (!sdBase) throw new Error('Enter an SD JQL query.');
  if (!hwBase) throw new Error('Enter an HW JQL query.');
  return {
    sd: `(${sdBase}) AND created >= ${quote(startDate)} AND created < ${quote(endExclusive)} ORDER BY created ASC`,
    hwPeriod: `(${hwBase}) AND (created >= ${quote(startDate)} AND created < ${quote(endExclusive)} OR resolutiondate >= ${quote(startDate)} AND resolutiondate < ${quote(endExclusive)} OR updated >= ${quote(startDate)} AND updated < ${quote(endExclusive)}) ORDER BY created ASC`,
    hwOpen: `(${hwBase}) AND statusCategory != Done ORDER BY created ASC`
  };
}

function addHeader(ws, title) {
  ws.mergeCells('A1:H2');
  const c = ws.getCell('A1');
  c.value = title;
  c.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  c.alignment = { horizontal: 'center', vertical: 'middle' };
}

function section(ws, row, title) {
  ws.mergeCells(row, 1, row, 8);
  const c = ws.getCell(row, 1);
  c.value = title;
  c.font = { bold: true, size: 12 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
}

function kpis(ws, labelRow, labels, values, formats = {}) {
  labels.forEach((label, i) => {
    const cell = ws.getCell(labelRow, i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  values.forEach((value, i) => {
    const cell = ws.getCell(labelRow + 1, i + 1);
    cell.value = value;
    if (formats[i]) cell.numFmt = formats[i];
    cell.font = { bold: true, size: 18 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      bottom: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      left: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      right: { style: 'thin', color: { argb: 'FFB8C6D1' } }
    };
  });
}

function table(ws, row, headers, rows, widths = []) {
  headers.forEach((header, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = header;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = widths[i] || 20;
  });
  rows.forEach((values, r) => values.forEach((value, i) => {
    const c = ws.getCell(row + r + 1, i + 1);
    if (value instanceof Date) { c.value = value; c.numFmt = 'dd mmm yyyy'; }
    else c.value = display(value);
    c.alignment = { vertical: 'top', wrapText: true };
    if ((row + r + 1) % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8F9' } };
  }));
  ws.autoFilter = { from: { row, column: 1 }, to: { row, column: headers.length } };
}

export async function buildHardwareWeeklyReportV2(options = {}) {
  const config = { ...HARDWARE_WEEKLY_DEFAULTS_V2, ...options };
  const startDate = String(config.startDate || '').slice(0, 10);
  const endDate = String(config.endDate || '').slice(0, 10);
  if (!DATE_ONLY.test(startDate) || !DATE_ONLY.test(endDate)) throw new Error('Choose a report start and end date.');
  const endExclusive = nextDayV2(endDate);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endExclusive}T00:00:00.000Z`);
  if (end <= start) throw new Error('Report end date must be on or after the start date.');

  const queries = buildDualJqlV2(config, startDate, endExclusive);
  const fields = ['status', 'created', 'updated', 'resolutiondate', 'issuelinks', config.dateSentFieldId, config.clientFieldId].filter(Boolean);
  const maxIssues = Math.min(10000, Math.max(100, Number(config.maxIssues) || 5000));

  const [sdResult, hwPeriodResult, hwOpenResult] = await Promise.all([
    searchIssues(queries.sd, ['status', 'created', 'issuelinks', config.clientFieldId].filter(Boolean), maxIssues),
    searchIssues(queries.hwPeriod, fields, maxIssues),
    searchIssues(queries.hwOpen, fields, maxIssues)
  ]);
  const sdIssues = sdResult.issues || [];
  const hwPeriodIssues = hwPeriodResult.issues || [];
  const hwOpenIssues = hwOpenResult.issues || [];
  const hwIssues = mergeIssues(hwPeriodIssues, hwOpenIssues);

  const historyResults = await concurrent(hwPeriodIssues, 8, async issue => ({
    key: issue.key,
    histories: await getIssueChangelog(issue.key, 500)
  }));
  const receivedByKey = new Map();
  const warnings = [];
  historyResults.forEach((result, i) => {
    if (result?.error) { warnings.push(`${hwPeriodIssues[i]?.key}: ${result.error.message}`); return; }
    const received = receivedDateV2(result.histories, config.receivedStatuses);
    if (received) receivedByKey.set(result.key, received);
  });

  const hwPrefix = `${String(config.hwProjectKey || 'HW').toUpperCase()}-`;
  const sdPrefix = `${String(config.sdProjectKey || 'SD').toUpperCase()}-`;
  const escalated = sdIssues.filter(issue => linkedKeysV2(issue).some(key => key.startsWith(hwPrefix)));
  const created = hwIssues.filter(issue => inRange(issue.fields?.created, start, end));
  const sent = hwIssues.filter(issue => inRange(issue.fields?.[config.dateSentFieldId], start, end));
  const received = [...receivedByKey.entries()].filter(([, date]) => inRange(date, start, end));
  const open = hwIssues.filter(issue => String(issue.fields?.status?.statusCategory?.key || '').toLowerCase() !== 'done' && !issue.fields?.resolutiondate);
  const aged = open.filter(issue => {
    const d = asDate(issue.fields?.created);
    return d && Date.now() - d.getTime() > 14 * 86400000;
  });
  const closed = hwIssues.filter(issue => inRange(issue.fields?.resolutiondate, start, end));

  const dispatchWanted = lowerList(config.awaitingDispatchStatuses);
  const returnWanted = lowerList(config.awaitingReturnStatuses);
  const awaitingDispatch = open.filter(issue => dispatchWanted.length
    ? dispatchWanted.includes(statusName(issue).toLowerCase())
    : !issue.fields?.[config.dateSentFieldId]);
  const awaitingReturn = open.filter(issue => returnWanted.length
    ? returnWanted.includes(statusName(issue).toLowerCase())
    : Boolean(issue.fields?.[config.dateSentFieldId]));

  const summary = {
    sdRaised: sdIssues.length,
    sdEscalated: escalated.length,
    escalationRate: sdIssues.length ? escalated.length / sdIssues.length : 0,
    hwCreated: created.length,
    devicesSent: sent.length,
    devicesReceived: received.length,
    outstandingDevices: awaitingDispatch.length + awaitingReturn.length,
    openHw: open.length,
    openOverTwoWeeks: aged.length,
    hwClosed: closed.length,
    awaitingDispatch: awaitingDispatch.length,
    awaitingReturn: awaitingReturn.length
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nuvriqo Excel Report Manager';
  wb.created = new Date();

  const ws = wb.addWorksheet('Weekly Report', { views: [{ showGridLines: false }] });
  addHeader(ws, 'Weekly SD → Hardware Management Report');
  [['Report Start', start], ['Report End', new Date(`${endDate}T00:00:00.000Z`)], ['SD Project', config.sdProjectKey], ['HW Project', config.hwProjectKey]].forEach((x, i) => {
    const row = 4 + i;
    ws.getCell(row, 1).value = x[0];
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
    ws.getCell(row, 2).value = x[1];
    if (x[1] instanceof Date) ws.getCell(row, 2).numFmt = 'dd mmm yyyy';
  });
  section(ws, 10, 'SD Demand');
  kpis(ws, 12, ['SD Tickets Raised', 'SD Tickets Escalated to HW', 'Escalation Rate'], [summary.sdRaised, summary.sdEscalated, summary.escalationRate], { 2: '0.0%' });
  section(ws, 16, 'Hardware Workload');
  kpis(ws, 18, ['HW Tickets Created', 'Devices Sent', 'Devices Received Back', 'Outstanding Devices'], [summary.hwCreated, summary.devicesSent, summary.devicesReceived, summary.outstandingDevices]);
  kpis(ws, 22, ['Open HW Tickets', 'Open > 2 Weeks', 'HW Tickets Closed', 'Awaiting Dispatch'], [summary.openHw, summary.openOverTwoWeeks, summary.hwClosed, summary.awaitingDispatch]);
  section(ws, 26, 'Outstanding Hardware Breakdown');
  table(ws, 28, ['Category', 'Count'], [['Awaiting Dispatch', summary.awaitingDispatch], ['Awaiting Return', summary.awaitingReturn]], [26, 12]);
  section(ws, 33, 'Queries Used');
  ws.getCell('A35').value = 'SD query'; ws.getCell('B35').value = queries.sd;
  ws.getCell('A36').value = 'HW period query'; ws.getCell('B36').value = queries.hwPeriod;
  ws.getCell('A37').value = 'HW open query'; ws.getCell('B37').value = queries.hwOpen;
  ['A35','A36','A37'].forEach(ref => ws.getCell(ref).font = { bold: true });
  ['B35','B36','B37'].forEach(ref => ws.getCell(ref).alignment = { wrapText: true, vertical: 'top' });
  ws.getColumn(1).width = 26; ws.getColumn(2).width = 80; for (let i = 3; i <= 8; i++) ws.getColumn(i).width = 22;

  const sdSheet = wb.addWorksheet('SD Query Data');
  table(sdSheet, 1, ['Ticket Key', 'Summary', 'Status', 'Created', 'Linked HW Ticket(s)', 'Escalated to HW', 'Client'], sdIssues.map(issue => [
    issue.key,
    issue.fields?.summary,
    statusName(issue),
    asDate(issue.fields?.created),
    linkedKeysV2(issue).filter(key => key.startsWith(hwPrefix)).join(', '),
    linkedKeysV2(issue).some(key => key.startsWith(hwPrefix)) ? 'Yes' : 'No',
    config.clientFieldId ? issue.fields?.[config.clientFieldId] : ''
  ]), [14, 46, 22, 16, 26, 18, 22]);
  sdSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const hwSheet = wb.addWorksheet('HW Query Data');
  table(hwSheet, 1, ['Ticket Key', 'Summary', 'Status', 'Created', 'Date Sent', 'Received Event Date', 'Resolved Date', 'Linked SD Ticket(s)', 'Age (Days)', 'Outstanding Category', 'Client'], hwIssues.map(issue => {
    const createdDate = asDate(issue.fields?.created);
    let category = '';
    if (open.some(x => x.key === issue.key)) {
      const current = statusName(issue).toLowerCase();
      if (dispatchWanted.length ? dispatchWanted.includes(current) : !issue.fields?.[config.dateSentFieldId]) category = 'Awaiting Dispatch';
      else if (returnWanted.length ? returnWanted.includes(current) : Boolean(issue.fields?.[config.dateSentFieldId])) category = 'Awaiting Return';
    }
    return [
      issue.key,
      issue.fields?.summary,
      statusName(issue),
      createdDate,
      asDate(issue.fields?.[config.dateSentFieldId]),
      receivedByKey.get(issue.key) || null,
      asDate(issue.fields?.resolutiondate),
      linkedKeysV2(issue).filter(key => key.startsWith(sdPrefix)).join(', '),
      createdDate ? Math.floor((Date.now() - createdDate.getTime()) / 86400000) : '',
      category,
      config.clientFieldId ? issue.fields?.[config.clientFieldId] : ''
    ];
  }), [14, 46, 22, 16, 16, 18, 16, 26, 12, 22, 22]);
  hwSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const configSheet = wb.addWorksheet('App Configuration');
  table(configSheet, 1, ['Setting', 'Value'], [
    ['SD base JQL', config.sdJql],
    ['HW base JQL', config.hwJql],
    ['Date Sent field', config.dateSentFieldId],
    ['Received status(es)', (config.receivedStatuses || []).join(', ') || '(automatic detection)'],
    ['Awaiting dispatch status(es)', (config.awaitingDispatchStatuses || []).join(', ') || '(Date Sent fallback)'],
    ['Awaiting return status(es)', (config.awaitingReturnStatuses || []).join(', ') || '(Date Sent fallback)'],
    ['Changelog warnings', warnings.join('\n') || 'None']
  ], [32, 100]);
  configSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const buffer = await wb.xlsx.writeBuffer();
  return {
    workbookBase64: Buffer.from(buffer).toString('base64'),
    filename: `Weekly SD-HW Report ${startDate} to ${endDate}.xlsx`,
    summary,
    queries,
    warnings,
    counts: { sdRows: sdIssues.length, hwRows: hwIssues.length }
  };
}
