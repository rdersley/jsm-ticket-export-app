import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFilterConfig, effectiveFilterConfig, customerFilterOptions, resolveCustomerFilters, jqlFieldFor } from '../src/services/portalFilters.js';
import { applyClauses } from '../src/services/dateFilter.js';

const config = {
  dateFields: [{ id: 'created', label: 'Created' }, { id: 'customfield_10050', label: 'Go-live date' }],
  choices: [
    { id: 'status', label: 'Status', values: [{ id: '1', label: 'Open' }, { id: '10001', label: 'Done' }] },
    { id: 'customfield_10020', label: 'Region', values: [{ id: '10100', label: 'EMEA' }, { id: '10101', label: 'APAC' }] }
  ]
};

test('unsaved settings fall back to the standard date fields', () => {
  assert.equal(normalizeFilterConfig(undefined), null);
  const effective = effectiveFilterConfig(null);
  assert.deepEqual(effective.dateFields.map(f => f.id), ['created', 'updated', 'resolved', 'due']);
  assert.deepEqual(effective.choices, []);
});

test('saved settings drop unknown fields, bad value ids and empty choices', () => {
  const clean = normalizeFilterConfig({
    dateFields: [{ id: 'created' }, { id: 'summary' }, { id: 'customfield_10050', label: 'Go-live' }, { id: 'created' }],
    choices: [
      { id: 'status', label: 'Status', values: [{ id: '1', label: 'Open' }, { id: '1) OR (1=1', label: 'x' }] },
      { id: 'priority', label: 'Priority', values: [] },
      { id: 'labels', label: 'Labels', values: [{ id: '5', label: 'x' }] }
    ]
  });
  assert.deepEqual(clean.dateFields.map(f => f.id), ['created', 'customfield_10050']);
  assert.deepEqual(clean.choices, [{ id: 'status', label: 'Status', values: [{ id: '1', label: 'Open' }] }]);
});

test('an explicitly empty selection offers no filters', () => {
  const options = customerFilterOptions({ dateFields: [], choices: [] });
  assert.deepEqual(options.dateFields, []);
  assert.deepEqual(options.choices, []);
  assert.throws(() => resolveCustomerFilters({ date: { field: 'created', preset: 'last7' } }, { dateFields: [], choices: [] }), /not available/);
});

test('builds date and choice clauses from allowed fields only', () => {
  const resolved = resolveCustomerFilters({
    date: { field: 'customfield_10050', preset: 'custom', from: '2026-09-01', to: '2026-09-30' },
    choices: { status: ['10001'], customfield_10020: ['10100', '10101'] }
  }, config);
  assert.deepEqual(resolved.clauses, [
    'cf[10050] >= "2026-09-01" AND cf[10050] < "2026-10-01"',
    'status in (10001)',
    'cf[10020] in (10100, 10101)'
  ]);
  assert.deepEqual(resolved.labels, ['Go-live date 2026-09-01 to 2026-09-30', 'Status Done', 'Region EMEA, APAC']);
  assert.equal(
    applyClauses('project = SD ORDER BY created DESC', resolved.clauses),
    '(project = SD) AND cf[10050] >= "2026-09-01" AND cf[10050] < "2026-10-01" AND status in (10001) AND cf[10020] in (10100, 10101) ORDER BY created DESC'
  );
});

test('rejects fields and values the creator did not allow', () => {
  assert.throws(() => resolveCustomerFilters({ date: { field: 'updated', preset: 'last7' } }, config), /not available/);
  assert.throws(() => resolveCustomerFilters({ choices: { priority: ['1'] } }, config), /not available/);
  assert.throws(() => resolveCustomerFilters({ choices: { status: ['3'] } }, config), /from the list/);
});

test('nothing selected means no filter', () => {
  assert.equal(resolveCustomerFilters(null, config), null);
  assert.equal(resolveCustomerFilters({ date: null, choices: { status: [] } }, config), null);
});

test('older date-only requests still work against the standard fields', () => {
  const resolved = resolveCustomerFilters({ field: 'created', preset: 'last30' }, null);
  assert.deepEqual(resolved.clauses, ['created >= -30d']);
});

test('only known fields map to JQL', () => {
  assert.equal(jqlFieldFor('customfield_10020', 'choice'), 'cf[10020]');
  assert.equal(jqlFieldFor('resolved', 'date'), 'resolved');
  assert.equal(jqlFieldFor('status', 'date'), null);
  assert.equal(jqlFieldFor('summary', 'choice'), null);
});
