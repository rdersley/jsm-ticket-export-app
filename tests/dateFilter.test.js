import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDateFilter, normalizeDateFilter, splitOrderBy, describeDateFilter } from '../src/services/dateFilter.js';

test('no filter leaves JQL untouched', () => {
  assert.equal(applyDateFilter('project = SD ORDER BY created DESC', null), 'project = SD ORDER BY created DESC');
  assert.equal(applyDateFilter('project = SD', { field: '' }), 'project = SD');
});

test('preset ranges wrap the query and keep ORDER BY', () => {
  assert.equal(
    applyDateFilter('project = SD OR project = HW ORDER BY created DESC', { field: 'created', preset: 'last30' }),
    '(project = SD OR project = HW) AND created >= -30d ORDER BY created DESC'
  );
  assert.equal(
    applyDateFilter('project = SD', { field: 'resolved', preset: 'lastMonth' }),
    '(project = SD) AND resolved >= startOfMonth(-1) AND resolved < startOfMonth()'
  );
});

test('query that is only ORDER BY gets a bare clause', () => {
  assert.equal(applyDateFilter('ORDER BY created DESC', { field: 'updated', preset: 'last7' }), 'updated >= -7d ORDER BY created DESC');
});

test('custom range includes the whole to-day', () => {
  assert.equal(
    applyDateFilter('project = SD', { field: 'created', preset: 'custom', from: '2026-09-01', to: '2026-09-30' }),
    '(project = SD) AND created >= "2026-09-01" AND created < "2026-10-01"'
  );
  assert.equal(
    applyDateFilter('project = SD', { field: 'due', preset: 'custom', to: '2026-12-31' }),
    '(project = SD) AND due < "2027-01-01"'
  );
});

test('ORDER BY inside quotes is not treated as the sort clause', () => {
  assert.deepEqual(splitOrderBy('summary ~ "order by mistake" ORDER BY key'), { where: 'summary ~ "order by mistake"', orderBy: 'ORDER BY key' });
});

test('rejects unsupported or malformed input', () => {
  assert.throws(() => normalizeDateFilter({ field: 'cf[10001]', preset: 'last7' }), /supported date field/);
  assert.throws(() => normalizeDateFilter({ field: 'created', preset: 'forever' }), /date range/);
  assert.throws(() => normalizeDateFilter({ field: 'created', preset: 'custom', from: '2026-02-30' }), /not a valid date/);
  assert.throws(() => normalizeDateFilter({ field: 'created', preset: 'custom', from: '2026-09-01" OR 1=1' }), /YYYY-MM-DD/);
  assert.throws(() => normalizeDateFilter({ field: 'created', preset: 'custom', from: '2026-09-30', to: '2026-09-01' }), /on or before/);
  assert.throws(() => normalizeDateFilter({ field: 'created', preset: 'custom' }), /from date, a to date/);
});

test('describes the range for file names and messages', () => {
  assert.equal(describeDateFilter({ field: 'created', preset: 'last30' }), 'Created last 30 days');
  assert.equal(describeDateFilter({ field: 'resolved', preset: 'custom', from: '2026-09-01', to: '2026-09-30' }), 'Resolved 2026-09-01 to 2026-09-30');
});
