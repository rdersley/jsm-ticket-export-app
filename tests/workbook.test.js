import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/services/workbook.js';

const baseReport = {
  name: 'Test report',
  template: {
    columns: [
      { fieldId: 'key', label: 'Key', width: 14 },
      { fieldId: 'summary', label: 'Summary', width: 40 },
      { fieldId: 'votes', label: 'Votes', width: 12 },
      { fieldId: 'created', label: 'Created', width: 20 }
    ],
    workbook: {
      sheetName: 'Issues', title: 'Service report', subtitle: 'Weekly snapshot',
      freezeHeader: true, autoFilter: true, alternateRows: true, jiraLinks: true,
      generatedAt: true, footerInfo: true, wrapText: true, showGridLines: false,
      autoDateFormat: true, dateFormat: 'dd/mm/yyyy hh:mm', orientation: 'landscape', fitToPage: true,
      headerBackground: '#0C66E4', headerTextColor: '#FFFFFF', bodyTextColor: '#172B4D',
      alternateRowBackground: '#F7F8F9', headerBold: true, headerAlignment: 'left',
      fontName: 'Aptos', headerFontSize: 11, bodyFontSize: 11, rowHeight: 20
    }
  }
};

const issues = [
  { key: 'DEMO-1', self: 'https://example.atlassian.net/rest/api/3/issue/10001', fields: { summary: 'First issue', votes: { votes: 4, self: 'https://example' }, created: '2026-08-19T11:44:42.530+0000' } },
  { key: 'DEMO-2', self: 'https://example.atlassian.net/rest/api/3/issue/10002', fields: { summary: 'Second issue', votes: { votes: 0, self: 'https://example' }, created: '2026-08-20T10:15:00.000+0000' } }
];

async function workbookFromReport(report = baseReport, data = issues) {
  const buffer = await buildWorkbook(report, data);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('data table starts at row 1 and metadata is below the data', async () => {
  const wb = await workbookFromReport(); const ws = wb.getWorksheet('Issues');
  assert.equal(ws.getCell('A1').value, 'Key');
  assert.equal(ws.getCell('A2').value.text, 'DEMO-1');
  assert.equal(ws.getCell('A3').value.text, 'DEMO-2');
  assert.equal(ws.getCell('A5').value, 'Report: Service report');
  assert.equal(ws.getCell('A6').value, 'Weekly snapshot');
  assert.match(String(ws.getCell('A7').value), /^Generated:/);
});

test('complex Jira vote values export as a human readable count', async () => {
  const wb = await workbookFromReport(); const ws = wb.getWorksheet('Issues');
  assert.equal(ws.getCell('C2').value, 4); assert.equal(ws.getCell('C3').value, 0);
});

test('Jira keys are exported as clickable links', async () => {
  const wb = await workbookFromReport(); const ws = wb.getWorksheet('Issues');
  assert.deepEqual(ws.getCell('A2').value, { text: 'DEMO-1', hyperlink: 'https://example.atlassian.net/browse/DEMO-1' });
});

test('header formatting settings are applied', async () => {
  const wb = await workbookFromReport(); const header = wb.getWorksheet('Issues').getCell('A1');
  assert.equal(header.font.bold, true); assert.equal(header.font.name, 'Aptos');
  assert.equal(header.font.color.argb, 'FFFFFFFF'); assert.equal(header.fill.fgColor.argb, 'FF0C66E4');
  assert.equal(header.alignment.horizontal, 'left');
});

test('worksheet names are sanitised for Excel', async () => {
  const report = structuredClone(baseReport); report.template.workbook.sheetName = 'Bad:/Name*?[]';
  const wb = await workbookFromReport(report, []);
  assert.equal(wb.worksheets.length, 1); assert.equal(wb.worksheets[0].name.includes(':'), false); assert.equal(wb.worksheets[0].name.includes('/'), false);
});

test('Jira date fields become native Excel dates with configured format', async () => {
  const wb = await workbookFromReport(); const cell = wb.getWorksheet('Issues').getCell('D2');
  assert.equal(cell.value instanceof Date, true); assert.equal(cell.numFmt, 'dd/mm/yyyy hh:mm');
});

test('body cells wrap text and print setup is applied', async () => {
  const wb = await workbookFromReport(); const ws = wb.getWorksheet('Issues');
  assert.equal(ws.getCell('B2').alignment.wrapText, true);
  assert.equal(ws.pageSetup.orientation, 'landscape');
  assert.equal(ws.pageSetup.fitToPage, true);
});
