import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenFilter, buildOpenClause } from '../src/services/openFilter.js';
import { normalizeFilterConfig, customerFilterOptions, resolveCustomerFilters } from '../src/services/portalFilters.js';
import { applyClauses } from '../src/services/dateFilter.js';

const withOpen = { dateFields: [{ id: 'created', label: 'Created' }], choices: [], openTickets: true };

test('open now uses the current resolution', () => {
  assert.deepEqual(buildOpenClause({ preset: 'now' }), { clause: 'resolution is EMPTY', label: 'Open now' });
});

test('end of last week and last month look at created and resolved dates', () => {
  assert.equal(buildOpenClause({ preset: 'endLastWeek' }).clause,
    'created <= endOfWeek(-1) AND (resolved is EMPTY OR resolved > endOfWeek(-1))');
  assert.equal(buildOpenClause({ preset: 'endLastMonth' }).clause,
    'created <= endOfMonth(-1) AND (resolved is EMPTY OR resolved > endOfMonth(-1))');
});

test('open on a date counts the whole chosen day', () => {
  const filter = normalizeOpenFilter({ preset: 'onDate', date: '2026-10-31' });
  assert.deepEqual(buildOpenClause(filter), {
    clause: 'created < "2026-11-01" AND (resolved is EMPTY OR resolved >= "2026-11-01")',
    label: 'Open on 2026-10-31'
  });
});

test('rejects bad presets and dates', () => {
  assert.equal(normalizeOpenFilter(null), null);
  assert.equal(normalizeOpenFilter({ preset: '' }), null);
  assert.throws(() => normalizeOpenFilter({ preset: 'forever' }), /open/);
  assert.throws(() => normalizeOpenFilter({ preset: 'onDate' }), /YYYY-MM-DD/);
  assert.throws(() => normalizeOpenFilter({ preset: 'onDate', date: '2026-02-30' }), /not a valid date/);
  assert.throws(() => normalizeOpenFilter({ preset: 'onDate', date: '2026-10-01" OR 1=1' }), /YYYY-MM-DD/);
});

test('the open filter is opt-in per report', () => {
  assert.equal(normalizeFilterConfig({ dateFields: [], choices: [] }).openTickets, undefined);
  assert.equal(normalizeFilterConfig({ dateFields: [], choices: [], openTickets: true }).openTickets, true);
  assert.deepEqual(customerFilterOptions({ dateFields: [], choices: [] }).openPresets, []);
  assert.deepEqual(customerFilterOptions(withOpen).openPresets.map(p => p.id), ['now', 'endLastWeek', 'endLastMonth', 'onDate']);
  assert.deepEqual(customerFilterOptions(null).openPresets, []);
  assert.throws(() => resolveCustomerFilters({ open: { preset: 'now' } }, { dateFields: [], choices: [] }), /not available/);
});

test('combines with the date filter and keeps ORDER BY', () => {
  const resolved = resolveCustomerFilters({ date: { field: 'created', preset: 'last30' }, open: { preset: 'endLastWeek' } }, withOpen);
  assert.deepEqual(resolved.labels, ['Created last 30 days', 'Open at end of last week']);
  assert.equal(
    applyClauses('project = SD ORDER BY created DESC', resolved.clauses),
    '(project = SD) AND created >= -30d AND created <= endOfWeek(-1) AND (resolved is EMPTY OR resolved > endOfWeek(-1)) ORDER BY created DESC'
  );
});

test('an open filter on its own is enough to make a filtered run', () => {
  assert.deepEqual(resolveCustomerFilters({ open: { preset: 'now' } }, withOpen).clauses, ['resolution is EMPTY']);
  assert.equal(resolveCustomerFilters({ open: { preset: '' } }, withOpen), null);
});
