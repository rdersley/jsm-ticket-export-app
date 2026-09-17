import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDualJqlV2, linkedKeysV2, receivedDateV2, nextDayV2 } from '../src/services/hardwareWeeklyReportV2.js';

test('buildDualJqlV2 preserves separate client filters and adds reporting dates', () => {
  const queries = buildDualJqlV2({
    sdProjectKey: 'SD',
    hwProjectKey: 'HW',
    sdJql: 'project = SD AND "SD Client" = RYR',
    hwJql: 'project = HW AND "SD Client" = RYR'
  }, '2026-09-07', '2026-09-14');

  assert.match(queries.sd, /project = SD AND "SD Client" = RYR/);
  assert.match(queries.sd, /created >= "2026-09-07"/);
  assert.match(queries.hwPeriod, /project = HW AND "SD Client" = RYR/);
  assert.match(queries.hwOpen, /statusCategory != Done/);
});

test('buildDualJqlV2 strips user ORDER BY before wrapping the base query', () => {
  const queries = buildDualJqlV2({
    sdProjectKey: 'SD',
    hwProjectKey: 'HW',
    sdJql: 'project = SD ORDER BY created DESC',
    hwJql: 'project = HW ORDER BY updated DESC'
  }, '2026-09-07', '2026-09-14');
  assert.equal((queries.sd.match(/ORDER BY/g) || []).length, 1);
  assert.equal((queries.hwPeriod.match(/ORDER BY/g) || []).length, 1);
});

test('buildDualJqlV2 falls back to project queries when custom JQL is blank', () => {
  const queries = buildDualJqlV2({ sdProjectKey: 'SD', hwProjectKey: 'HW', sdJql: '', hwJql: '' }, '2026-09-07', '2026-09-14');
  assert.match(queries.sd, /project = "SD"/);
  assert.match(queries.hwOpen, /project = "HW"/);
});

test('linkedKeysV2 detects linked SD/HW issues', () => {
  assert.deepEqual(linkedKeysV2({ fields: { issuelinks: [
    { outwardIssue: { key: 'HW-22' } },
    { inwardIssue: { key: 'SD-9' } }
  ] } }), ['HW-22', 'SD-9']);
});

test('receivedDateV2 uses configured status names', () => {
  const d = receivedDateV2([{ created: '2026-09-11T10:00:00.000Z', items: [{ field: 'status', toString: 'Returned from Crew' }] }], ['Returned from Crew']);
  assert.equal(d.toISOString(), '2026-09-11T10:00:00.000Z');
});

test('nextDayV2 crosses month boundaries', () => {
  assert.equal(nextDayV2('2026-09-30'), '2026-10-01');
});
