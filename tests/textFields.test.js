import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/services/workbook.js';
import { ageDays, searchFieldIds, excerpt, cascadePart, cascadeColumns } from '../src/services/textFields.js';

const doc = (...paragraphs) => ({ type: 'doc', version: 1, content: paragraphs.map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });

const report = {
  name: 'Customer report',
  template: {
    columns: [
      { fieldId: 'key', label: 'Key' },
      { fieldId: 'description', label: 'Description' },
      { fieldId: 'comment', label: 'Comments' },
      { fieldId: 'erm:descriptionExcerpt', label: 'Description excerpt' },
      { fieldId: 'erm:latestPublicComment', label: 'Latest public comment' },
      { fieldId: 'erm:latestPublicCommentDate', label: 'Latest public comment date' }
    ],
    workbook: { footerInfo: false }
  }
};

const issues = [
  {
    key: 'RYR-1',
    fields: {
      description: doc('Card reader on trolley 4 rejects contactless.', `${'More detail. '.repeat(60)}`),
      comment: { comments: [
        { body: doc('We have reset the device.'), created: '2026-09-02T10:00:00.000+0000', author: { displayName: 'Agent A' }, jsdPublic: true },
        { body: doc('INTERNAL: legacy contract'), created: '2026-09-04T10:00:00.000+0000', jsdPublic: false },
        { body: doc('No flag, treat as internal'), created: '2026-09-05T10:00:00.000+0000' },
        { body: doc('Please confirm it works now.'), created: '2026-09-03T10:00:00.000+0000', author: { displayName: 'Agent B' }, jsdPublic: true }
      ] }
    }
  },
  { key: 'RYR-2', fields: {} }
];

async function sheet() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildWorkbook(report, issues));
  return wb.worksheets[0];
}

test('report-only columns search for their Jira source field', () => {
  assert.deepEqual(searchFieldIds(['summary', 'erm:descriptionExcerpt', 'erm:latestPublicComment', 'erm:latestPublicCommentDate']), ['summary', 'description', 'comment']);
});

test('description exports as readable text, not ADF', async () => {
  const ws = await sheet();
  assert.match(ws.getCell('B2').value, /^Card reader on trolley 4 rejects contactless\.\nMore detail\./);
  assert.doesNotMatch(ws.getCell('B2').value, /"type"/);
});

test('excerpt columns hold the first 300 characters and the latest public comment', async () => {
  const ws = await sheet();
  const description = ws.getCell('D2').value;
  assert.ok(description.length <= 301 && description.endsWith('…'));
  assert.equal(ws.getCell('E2').value, 'Please confirm it works now.');
  assert.ok(ws.getCell('F2').value instanceof Date);
  assert.equal(ws.getCell('F2').value.toISOString(), '2026-09-03T10:00:00.000Z');
});

test('internal and unflagged comments never reach the workbook', async () => {
  const ws = await sheet();
  assert.equal(ws.getCell('C2').value, '2026-09-02 Agent A: We have reset the device.\n\n2026-09-03 Agent B: Please confirm it works now.');
  ws.eachRow(row => row.eachCell(cell => assert.doesNotMatch(String(cell.value ?? ''), /INTERNAL|treat as internal/)));
});

test('empty description and comments export as blank cells', async () => {
  const ws = await sheet();
  for (const col of ['B', 'C', 'D', 'E', 'F']) assert.ok(!ws.getCell(`${col}3`).value, `${col}3 should be blank`);
});

test('excerpt keeps short text as is', () => {
  assert.equal(excerpt('  Short   text '), 'Short text');
});

test('any paragraph text field exports as plain text', async () => {
  const wb = new ExcelJS.Workbook();
  const columns = [{ fieldId: 'key', label: 'Key' }, { fieldId: 'customfield_200', label: 'Ticket overview' }];
  await wb.xlsx.load(await buildWorkbook({ name: 'r', template: { columns, workbook: { footerInfo: false } } }, [{ key: 'RYR-9', fields: { customfield_200: doc('The vPOS at STN is stuck.', 'Support has asked for a restart.') } }]));
  assert.equal(wb.worksheets[0].getCell('B2').value, 'The vPOS at STN is stuck.\nSupport has asked for a restart.');
});

test('age in days: to now while open, to the resolution date once resolved', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  assert.equal(ageDays({ created: '2026-10-18T09:00:00.000+0000' }, now), 10);
  assert.equal(ageDays({ created: '2026-10-18T09:00:00.000+0000', resolutiondate: '2026-10-21T08:59:00.000+0000' }, now), 2);
  assert.equal(ageDays({ created: '2026-10-28T11:00:00.000+0000' }, now), 0);
  assert.equal(ageDays({}, now), '');
  assert.deepEqual(searchFieldIds(['summary', 'erm:ageDays', 'created']), ['summary', 'created', 'resolutiondate']);
});

test('age column exports as a number', async () => {
  const wb = new ExcelJS.Workbook();
  const columns = [{ fieldId: 'key', label: 'Key' }, { fieldId: 'erm:ageDays', label: 'Age (days)' }];
  await wb.xlsx.load(await buildWorkbook({ name: 'r', template: { columns, workbook: { footerInfo: false } } }, [{ key: 'RYR-9', fields: { created: '2026-09-01T09:00:00.000+0000', resolutiondate: '2026-09-15T10:00:00.000+0000' } }]));
  assert.equal(wb.worksheets[0].getCell('B2').value, 14);
});

test('cascading selects split into parent and child columns next to the combined one', async () => {
  const wb = new ExcelJS.Workbook();
  const columns = [
    { fieldId: 'key', label: 'Key' },
    { fieldId: 'customfield_10300', label: 'Module type' },
    { fieldId: 'erm:cascadeParent:customfield_10300', label: 'Module type (parent)' },
    { fieldId: 'erm:cascadeChild:customfield_10300', label: 'Module type (child)' }
  ];
  const issues = [
    { key: 'RYR-1', fields: { customfield_10300: { value: 'Access Control', child: { value: 'Account Suspended' } } } },
    { key: 'RYR-2', fields: { customfield_10300: { value: 'Hardware' } } },
    { key: 'RYR-3', fields: {} }
  ];
  await wb.xlsx.load(await buildWorkbook({ name: 'r', template: { columns, workbook: { footerInfo: false } } }, issues));
  const ws = wb.worksheets[0];
  assert.deepEqual([ws.getCell('B2').value, ws.getCell('C2').value, ws.getCell('D2').value], ['Access Control - Account Suspended', 'Access Control', 'Account Suspended']);
  assert.equal(ws.getCell('C3').value, 'Hardware');
  assert.ok(!ws.getCell('D3').value, 'a parent without a child leaves the child cell blank');
  assert.ok(!ws.getCell('C4').value && !ws.getCell('D4').value);
});

test('parent and child columns search for the cascading field itself', () => {
  assert.deepEqual(
    searchFieldIds(['erm:cascadeParent:customfield_10300', 'erm:cascadeChild:customfield_10300', 'summary']),
    ['customfield_10300', 'summary']
  );
  assert.equal(cascadePart('erm:cascadeParent:summary'), null);
  assert.deepEqual(cascadeColumns({ id: 'customfield_10300', name: 'Module type' }).map(c => c.name), ['Module type (parent)', 'Module type (child)']);
});
