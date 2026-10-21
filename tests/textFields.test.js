import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../src/services/workbook.js';
import { searchFieldIds, excerpt } from '../src/services/textFields.js';

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
