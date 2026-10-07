import ExcelJS from 'exceljs';
import { searchIssues, getIssueChangelog } from './jira.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;

export const HARDWARE_WEEKLY_DEFAULTS = {
  sdProjectKey: 'SD',
  hwProjectKey: 'HW',
  dateSentFieldId: 'customfield_10433',
  clientFieldId: '',
  receivedStatuses: [],
  awaitingDispatchStatuses: [],
  awaitingReturnStatuses: [],
  maxIssues: 5000
};

const q = value => `"${String(value || '').replace(/"/g, '\\"')}"`;
const dateOnly = value => String(value || '').slice(0, 10);
const asDate = value => value ? new Date(value) : null;
const inRange = (value, start, endExclusive) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start.getTime() && time < endExclusive.getTime();
};

export function nextDay(value) {
  if (!DATE_ONLY.test(String(value || ''))) throw new Error('Report dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function linkedIssueKeys(issue) {
  const links = issue?.fields?.issuelinks || [];
  const keys = [];
  for (const link of links) {
    const linked = link?.outwardIssue || link?.inwardIssue;
    const key = String(linked?.key || '').toUpperCase();
    if (JIRA_KEY.test(key) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function isEscalatedToProject(issue, projectKey) {
  const prefix = `${String(projectKey || '').toUpperCase()}-`;
  return linkedIssueKeys(issue).some(key => key.startsWith(prefix));
}

const statusName = issue => String(issue?.fields?.status?.name || '');
const display = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(', ');
  if (value.child?.value != null && value.value != null) return `${value.value} - ${value.child.value}`;
  return value.value ?? value.name ?? value.displayName ?? value.key ?? JSON.stringify(value);
};

const normaliseStatuses = values => (values || []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
const statusMatches = (name, configured, fallbackRegex = null) => {
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return false;
  const wanted = normaliseStatuses(configured);
  if (wanted.length) return wanted.includes(clean);
  return fallbackRegex ? fallbackRegex.test(clean) : false;
};

export function receivedTransitionDate(histories, receivedStatuses = []) {
  const candidates = [];
  for (const history of histories || []) {
    for (const item of history?.items || []) {
      if (String(item?.field || '').toLowerCase() !== 'status') continue;
      const target = item?.toString || '';
      if (statusMatches(target, receivedStatuses, /(receiv|returned?|device.*back|back.*device)/i)) {
        const when = new Date(history.created);
        if (Number.isFinite(when.getTime())) candidates.push(when);
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a - b);
  return candidates[0];
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
  return results;
}

const mergeIssues = (...groups) => {
  const byKey = new Map();
  groups.flat().forEach(issue => { if (issue?.key) byKey.set(issue.key, issue); });
  return [...byKey.values()];
};

const makeJql = ({ sdProjectKey, hwProjectKey, startDate, endExclusive }) => ({
  sd: `project = ${q(sdProjectKey)} AND created >= ${q(startDate)} AND created < ${q(endExclusive)} ORDER BY created ASC`,
  hwPeriod: `project = ${q(hwProjectKey)} AND (created >= ${q(startDate)} AND created < ${q(endExclusive)} OR resolutiondate >= ${q(startDate)} AND resolutiondate < ${q(endExclusive)} OR updated >= ${q(startDate)} AND updated < ${q(endExclusive)}) ORDER BY created ASC`,
  hwOpen: `project = ${q(hwProjectKey)} AND statusCategory != Done ORDER BY created ASC`
});

const addTitle = (ws, title, span = 8) => {
  ws.mergeCells(1, 1, 2, span);
  const cell = ws.getCell(1, 1);
  cell.value = title;
  cell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 24;
};

const styleSection = (ws, row, title, span = 8) => {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: 'FF172B4D' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
};

const styleKpiLabels = (ws, row, count) => {
  for (let c = 1; c <= count; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
};

const styleKpiValues = (ws, row, count) => {
  for (let c = 1; c <= count; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true, size: 18 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      bottom: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      left: { style: 'thin', color: { argb: 'FFB8C6D1' } },
      right: { style: 'thin', color: { argb: 'FFB8C6D1' } }
    };
  }
};

const addTable = (ws, startRow, headers, rows, widths = []) => {
  headers.forEach((header, i) => {
    const cell = ws.getCell(startRow, i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    ws.getColumn(i + 1).width = widths[i] || Math.max(12, Math.min(40, String(header).length + 4));
  });
  rows.forEach((values, r) => {
    values.forEach((value, c) => {
      const cell = ws.getCell(startRow + 1 + r, c + 1);
      cell.value = value instanceof Date ? value : display(value);
      if (value instanceof Date) cell.numFmt = 'dd mmm yyyy';
      cell.alignment = { vertical: 'top', wrapText: true };
      if ((startRow + 1 + r) % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8F9' } };
    });
  });
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: headers.length } };
};

export async function buildHardwareWeeklyReport(options = {}) {
  const config = { ...HARDWARE_WEEKLY_DEFAULTS, ...options };
  const startDate = dateOnly(config.startDate);
  const endDate = dateOnly(config.endDate);
  if (!DATE_ONLY.test(startDate) || !DATE_ONLY.test(endDate)) throw new Error('Choose a report start and end date.');
  const endExclusive = nextDay(endDate);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusiveDate = new Date(`${endExclusive}T00:00:00.000Z`);
  if (endExclusiveDate <= start) throw new Error('Report end date must be on or after the start date.');

  const jql = makeJql({ ...config, startDate, endExclusive });
  const fields = ['status', 'created', 'updated', 'resolutiondate', 'issuelinks', config.dateSentFieldId, config.clientFieldId].filter(Boolean);
  const maxIssues = Math.min(10000, Math.max(100, Number(config.maxIssues) || 5000));

  const [sdResult, hwPeriodResult, hwOpenResult] = await Promise.all([
    searchIssues(jql.sd, ['status', 'created', 'issuelinks', config.clientFieldId].filter(Boolean), maxIssues),
    searchIssues(jql.hwPeriod, fields, maxIssues),
    searchIssues(jql.hwOpen, fields, maxIssues)
  ]);

  const sdIssues = sdResult.issues || [];
  const hwPeriodIssues = hwPeriodResult.issues || [];
  const hwOpenIssues = hwOpenResult.issues || [];
  const hwIssues = mergeIssues(hwPeriodIssues, hwOpenIssues);

  const changeResults = await mapWithConcurrency(hwPeriodIssues, 8, async issue => ({
    key: issue.key,
    histories: await getIssueChangelog(issue.key, 500)
  }));
  const receivedDates = new Map();
  const changelogWarnings = [];
  changeResults.forEach((result, index) => {
    if (result?.error) {
      changelogWarnings.push(`${hwPeriodIssues[index]?.key || 'HW issue'}: ${result.error.message}`);
      return;
    }
    const date = receivedTransitionDate(result?.histories || [], config.receivedStatuses);
    if (date) receivedDates.set(result.key, date);
  });

  const escalatedSd = sdIssues.filter(issue => isEscalatedToProject(issue, config.hwProjectKey));
  const hwCreated = hwIssues.filter(issue => inRange(issue.fields?.created, start, endExclusiveDate));
  const devicesSent = hwIssues.filter(issue => inRange(issue.fields?.[config.dateSentFieldId], start, endExclusiveDate));
  const devicesReceived = [...receivedDates.entries()].filter(([, value]) => inRange(value, start, endExclusiveDate));
  const openHw = hwIssues.filter(issue => String(issue.fields?.status?.statusCategory?.key || '').toLowerCase() !== 'done' && !issue.fields?.resolutiondate);
  const olderThanTwoWeeks = openHw.filter(issue => {
    const created = asDate(issue.fields?.created);
    return created && (Date.now() - created.getTime()) > 14 * 24 * 60 * 60 * 1000;
  });
  const hwClosed = hwIssues.filter(issue => inRange(issue.fields?.resolutiondate, start, endExclusiveDate));

  const dispatchStatuses = normaliseStatuses(config.awaitingDispatchStatuses);
  const returnStatuses = normaliseStatuses(config.awaitingReturnStatuses);
  const awaitingDispatch = openHw.filter(issue => {
    const current = statusName(issue).toLowerCase();
    if (dispatchStatuses.length) return dispatchStatuses.includes(current);
    return !issue.fields?.[config.dateSentFieldId];
  });
  const awaitingReturn = openHw.filter(issue => {
    const current = statusName(issue).toLowerCase();
    if (returnStatuses.length) return returnStatuses.includes(current);
    return Boolean(issue.fields?.[config.dateSentFieldId]);
  });

  const kpis = {
    sdRaised: sdIssues.length,
    sdEscalated: escalatedSd.length,
    escalationRate: sdIssues.length ? escalatedSd.length / sdIssues.length : 0,
    hwCreated: hwCreated.length,
    devicesSent: devicesSent.length,
    devicesReceived: devicesReceived.length,
    outstandingDevices: awaitingDispatch.length + awaitingReturn.length,
    openHw: openHw.length,
    openOverTwoWeeks: olderThanTwoWeeks.length,
    hwClosed: hwClosed.length,
    awaitingDispatch: awaitingDispatch.length,
    awaitingReturn: awaitingReturn.length
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nuvriqo Excel Report Manager';
  wb.created = new Date();

  const summary = wb.addWorksheet('Weekly Report', { views: [{ showGridLines: false }] });
  addTitle(summary, 'Weekly SD → Hardware Management Report');
  summary.getCell('A4').value = 'Report Start'; summary.getCell('B4').value = start; summary.getCell('B4').numFmt = 'dd mmm yyyy';
  summary.getCell('A5').value = 'Report End'; summary.getCell('B5').value = new Date(`${endDate}T00:00:00.000Z`); summary.getCell('B5').numFmt = 'dd mmm yyyy';
  summary.getCell('A6').value = 'SD Project'; summary.getCell('B6').value = config.sdProjectKey;
  summary.getCell('A7').value = 'HW Project'; summary.getCell('B7').value = config.hwProjectKey;
  ['A4','A5','A6','A7'].forEach(ref => { summary.getCell(ref).font = { bold: true }; summary.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } }; });

  styleSection(summary, 10, 'SD Demand');
  ['SD Tickets Raised', 'SD Tickets Escalated to HW', 'Escalation Rate'].forEach((x, i) => summary.getCell(12, i + 1).value = x);
  styleKpiLabels(summary, 12, 3);
  summary.getCell('A13').value = kpis.sdRaised;
  summary.getCell('B13').value = kpis.sdEscalated;
  summary.getCell('C13').value = kpis.escalationRate; summary.getCell('C13').numFmt = '0.0%';
  styleKpiValues(summary, 13, 3);

  styleSection(summary, 16, 'Hardware Workload');
  ['HW Tickets Created', 'Devices Sent', 'Devices Received Back', 'Outstanding Devices'].forEach((x, i) => summary.getCell(18, i + 1).value = x);
  styleKpiLabels(summary, 18, 4);
  [kpis.hwCreated, kpis.devicesSent, kpis.devicesReceived, kpis.outstandingDevices].forEach((x, i) => summary.getCell(19, i + 1).value = x);
  styleKpiValues(summary, 19, 4);
  ['Open HW Tickets', 'Open > 2 Weeks', 'HW Tickets Closed', 'Awaiting Dispatch'].forEach((x, i) => summary.getCell(22, i + 1).value = x);
  styleKpiLabels(summary, 22, 4);
  [kpis.openHw, kpis.openOverTwoWeeks, kpis.hwClosed, kpis.awaitingDispatch].forEach((x, i) => summary.getCell(23, i + 1).value = x);
  styleKpiValues(summary, 23, 4);

  styleSection(summary, 26, 'Outstanding Hardware Breakdown');
  addTable(summary, 28, ['Category', 'Count'], [['Awaiting Dispatch', kpis.awaitingDispatch], ['Awaiting Return', kpis.awaitingReturn]], [24, 12]);

  styleSection(summary, 33, 'Report Notes');
  summary.getCell('A35').value = config.receivedStatuses?.length
    ? `Received-back count uses transitions into: ${config.receivedStatuses.join(', ')}`
    : 'Received-back count uses automatic status-name detection until explicit received status(es) are configured.';
  summary.getCell('A36').value = config.awaitingDispatchStatuses?.length || config.awaitingReturnStatuses?.length
    ? 'Outstanding categories use the configured HW status mappings.'
    : 'Outstanding categories currently use Date Sent as a fallback: blank = awaiting dispatch; populated = awaiting return.';
  summary.getCell('A37').value = changelogWarnings.length ? `${changelogWarnings.length} changelog lookup(s) could not be read; see App Configuration.` : 'All required HW changelogs were read successfully.';
  summary.mergeCells('A35:H35'); summary.mergeCells('A36:H36'); summary.mergeCells('A37:H37');
  ['A35','A36','A37'].forEach(ref => { summary.getCell(ref).alignment = { wrapText: true }; });
  [24, 22, 22, 24, 18, 18, 18, 18].forEach((width, i) => summary.getColumn(i + 1).width = width);

  const sdSheet = wb.addWorksheet('SD Query Data');
  addTable(sdSheet, 1,
    ['Ticket Key', 'Summary', 'Status', 'Created', 'Linked HW Ticket(s)', 'Escalated to HW', 'Client'],
    sdIssues.map(issue => [
      issue.key,
      issue.fields?.summary,
      statusName(issue),
      asDate(issue.fields?.created),
      linkedIssueKeys(issue).filter(key => key.startsWith(`${config.hwProjectKey.toUpperCase()}-`)).join(', '),
      isEscalatedToProject(issue, config.hwProjectKey) ? 'Yes' : 'No',
      config.clientFieldId ? issue.fields?.[config.clientFieldId] : ''
    ]),
    [14, 46, 20, 16, 24, 18, 20]
  );
  sdSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const hwSheet = wb.addWorksheet('HW Query Data');
  const receivedByKey = new Map(devicesReceived);
  addTable(hwSheet, 1,
    ['Ticket Key', 'Summary', 'Status', 'Created', 'Date Sent', 'Received Event Date', 'Resolved Date', 'Linked SD Ticket(s)', 'Age (Days)', 'Outstanding Category', 'Client'],
    hwIssues.map(issue => {
      const created = asDate(issue.fields?.created);
      const current = statusName(issue).toLowerCase();
      let outstanding = '';
      if (openHw.some(x => x.key === issue.key)) {
        if (dispatchStatuses.length ? dispatchStatuses.includes(current) : !issue.fields?.[config.dateSentFieldId]) outstanding = 'Awaiting Dispatch';
        else if (returnStatuses.length ? returnStatuses.includes(current) : Boolean(issue.fields?.[config.dateSentFieldId])) outstanding = 'Awaiting Return';
      }
      return [
        issue.key,
        issue.fields?.summary,
        statusName(issue),
        created,
        asDate(issue.fields?.[config.dateSentFieldId]),
        receivedByKey.get(issue.key) || receivedDates.get(issue.key) || null,
        asDate(issue.fields?.resolutiondate),
        linkedIssueKeys(issue).filter(key => key.startsWith(`${config.sdProjectKey.toUpperCase()}-`)).join(', '),
        created ? Math.floor((Date.now() - created.getTime()) / 86400000) : '',
        outstanding,
        config.clientFieldId ? issue.fields?.[config.clientFieldId] : ''
      ];
    }),
    [14, 46, 20, 16, 16, 18, 16, 24, 12, 22, 20]
  );
  hwSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const cfg = wb.addWorksheet('App Configuration');
  addTable(cfg, 1, ['Setting', 'Value'], [
    ['SD Project', config.sdProjectKey],
    ['HW Project', config.hwProjectKey],
    ['Date Sent Field', config.dateSentFieldId],
    ['Client Field', config.clientFieldId || '(not configured)'],
    ['Received Status(es)', (config.receivedStatuses || []).join(', ') || '(automatic detection)'],
    ['Awaiting Dispatch Status(es)', (config.awaitingDispatchStatuses || []).join(', ') || '(Date Sent fallback)'],
    ['Awaiting Return Status(es)', (config.awaitingReturnStatuses || []).join(', ') || '(Date Sent fallback)'],
    ['SD JQL', jql.sd],
    ['HW Period JQL', jql.hwPeriod],
    ['HW Open JQL', jql.hwOpen],
    ['Changelog warnings', changelogWarnings.join('\n') || 'None']
  ], [30, 100]);
  cfg.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const buffer = await wb.xlsx.writeBuffer();
  return {
    workbookBase64: Buffer.from(buffer).toString('base64'),
    filename: `Weekly SD-HW Report ${startDate} to ${endDate}.xlsx`,
    kpis,
    counts: { sdRows: sdIssues.length, hwRows: hwIssues.length },
    warnings: changelogWarnings,
    queries: jql
  };
}
