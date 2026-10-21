// "Open tickets" customer filter for Portal Reports: work items that were open
// at a moment in time. A work item counts as open at moment M when it had been
// created by M and was not resolved yet (no resolution date, or resolved after
// M). "Open now" uses the current resolution instead.
import { parseIsoDate, isoDay } from './dateFilter.js';

export const OPEN_PRESETS = [
  { id: 'now', label: 'Open now' },
  { id: 'endLastWeek', label: 'Open at end of last week' },
  { id: 'endLastMonth', label: 'Open at end of last month' },
  { id: 'onDate', label: 'Open on a date' }
];

const openAt = moment => `created <= ${moment} AND (resolved is EMPTY OR resolved > ${moment})`;

/** Validates a customer's choice; returns { preset, date? }, null for none, or throws. */
export function normalizeOpenFilter(input) {
  if (!input || typeof input !== 'object' || !input.preset) return null;
  const preset = OPEN_PRESETS.find(p => p.id === input.preset);
  if (!preset) throw new Error('Choose when the work items should be open.');
  if (preset.id !== 'onDate') return { preset: preset.id };
  return { preset: 'onDate', date: isoDay(parseIsoDate(input.date, 'Open on date')) };
}

/** JQL clause and label for a validated open filter. */
export function buildOpenClause(filter) {
  switch (filter.preset) {
    case 'now': return { clause: 'resolution is EMPTY', label: 'Open now' };
    case 'endLastWeek': return { clause: openAt('endOfWeek(-1)'), label: 'Open at end of last week' };
    case 'endLastMonth': return { clause: openAt('endOfMonth(-1)'), label: 'Open at end of last month' };
    case 'onDate': {
      // Open at the end of the chosen day: created before the next day starts
      // and not resolved before it.
      const next = new Date(`${filter.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const end = `"${isoDay(next)}"`;
      return { clause: `created < ${end} AND (resolved is EMPTY OR resolved >= ${end})`, label: `Open on ${filter.date}` };
    }
    default: throw new Error('Unsupported open filter.');
  }
}
