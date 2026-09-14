import test from 'node:test';
import assert from 'node:assert/strict';
import { isDue, runKey } from '../src/services/schedule.js';

const report = (overrides = {}) => ({
  id: 'report-1',
  enabled: true,
  schedule: {
    frequency: 'weekly',
    time: '08:00',
    timezone: 'Europe/Dublin',
    weekday: 1,
    monthDay: 1,
    ...overrides
  }
});

test('disabled reports are never due', () => {
  const r = report();
  r.enabled = false;
  assert.equal(isDue(r, new Date('2026-08-31T07:00:00Z')), false);
});

test('weekly report is due on configured weekday at configured time', () => {
  assert.equal(isDue(report(), new Date('2026-08-31T07:04:00Z')), true);
});

test('weekly report remains due later the same day for catch-up', () => {
  assert.equal(isDue(report(), new Date('2026-08-31T12:30:00Z')), true);
});

test('weekly report is not due before configured time', () => {
  assert.equal(isDue(report(), new Date('2026-08-31T06:59:00Z')), false);
});

test('weekday reports do not run on weekends', () => {
  const r = report({ frequency: 'weekdays' });
  assert.equal(isDue(r, new Date('2026-08-29T07:04:00Z')), false);
  assert.equal(isDue(r, new Date('2026-08-31T07:04:00Z')), true);
});

test('monthly reports run only on configured day', () => {
  const r = report({ frequency: 'monthly', monthDay: 15 });
  assert.equal(isDue(r, new Date('2026-09-15T11:04:00Z')), true);
  assert.equal(isDue(r, new Date('2026-09-16T11:04:00Z')), false);
});

test('invalid timezone safely falls back to UTC', () => {
  const r = report({ frequency: 'daily', timezone: 'Not/AZone', time: '08:00' });
  assert.equal(isDue(r, new Date('2026-09-01T08:04:00Z')), true);
});

test('run key is stable throughout one scheduled day', () => {
  const r = report({ frequency: 'daily' });
  assert.equal(runKey(r, new Date('2026-09-01T07:00:00Z')), runKey(r, new Date('2026-09-01T18:08:00Z')));
});

test('Europe Dublin schedule follows summer daylight saving time', () => {
  const r = report({ frequency: 'daily', time: '08:00', timezone: 'Europe/Dublin' });
  assert.equal(isDue(r, new Date('2026-07-15T07:04:00Z')), true);
  assert.equal(isDue(r, new Date('2026-07-15T06:59:00Z')), false);
});

test('Europe Dublin schedule follows winter UTC time', () => {
  const r = report({ frequency: 'daily', time: '08:00', timezone: 'Europe/Dublin' });
  assert.equal(isDue(r, new Date('2026-12-15T08:04:00Z')), true);
  assert.equal(isDue(r, new Date('2026-12-15T07:59:00Z')), false);
});
