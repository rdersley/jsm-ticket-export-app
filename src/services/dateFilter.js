// Customer-chosen date ranges for Portal Reports exports. Only whitelisted
// fields and presets reach JQL, so customers cannot inject query text.

export const DATE_FIELDS = [
  { id: 'created', label: 'Created', jql: 'created' },
  { id: 'updated', label: 'Updated', jql: 'updated' },
  { id: 'resolved', label: 'Resolved', jql: 'resolved' },
  { id: 'due', label: 'Due date', jql: 'due' }
];

export const DATE_PRESETS = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom dates' }
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 3660;

function parseIsoDate(value, label) {
  const text = String(value || '').trim();
  if (!ISO_DATE.test(text)) throw new Error(`${label} must be a date in YYYY-MM-DD format.`);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} is not a valid date.`);
  }
  return date;
}

const isoDay = date => date.toISOString().slice(0, 10);

/** Returns a clean filter, null when no filter was requested, or throws. */
export function normalizeDateFilter(input) {
  if (!input || typeof input !== 'object' || !input.field) return null;
  const field = DATE_FIELDS.find(f => f.id === input.field);
  if (!field) throw new Error('Choose a supported date field.');
  const preset = DATE_PRESETS.find(p => p.id === input.preset);
  if (!preset) throw new Error('Choose a date range.');
  if (preset.id !== 'custom') return { field: field.id, preset: preset.id };

  const from = input.from ? parseIsoDate(input.from, 'From date') : null;
  const to = input.to ? parseIsoDate(input.to, 'To date') : null;
  if (!from && !to) throw new Error('Enter a from date, a to date, or both.');
  if (from && to && from > to) throw new Error('The from date must be on or before the to date.');
  if (from && to && (to - from) / 86400000 > MAX_CUSTOM_DAYS) throw new Error('Choose a date range of 10 years or less.');
  return { field: field.id, preset: 'custom', from: from ? isoDay(from) : null, to: to ? isoDay(to) : null };
}

function dateClause(filter) {
  const f = DATE_FIELDS.find(x => x.id === filter.field).jql;
  switch (filter.preset) {
    case 'last7': return `${f} >= -7d`;
    case 'last30': return `${f} >= -30d`;
    case 'thisMonth': return `${f} >= startOfMonth()`;
    case 'lastMonth': return `${f} >= startOfMonth(-1) AND ${f} < startOfMonth()`;
    case 'custom': {
      const parts = [];
      if (filter.from) parts.push(`${f} >= "${filter.from}"`);
      if (filter.to) {
        const next = new Date(`${filter.to}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        parts.push(`${f} < "${isoDay(next)}"`); // inclusive of the whole "to" day
      }
      return parts.join(' AND ');
    }
    default: throw new Error('Unsupported date range.');
  }
}

/** Splits trailing ORDER BY from JQL, ignoring text inside quotes. */
export function splitOrderBy(jql) {
  const text = String(jql || '');
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if ((i === 0 || /[\s)]/.test(text[i - 1])) && /^order\s+by\b/i.test(text.slice(i))) {
      return { where: text.slice(0, i).trim(), orderBy: text.slice(i).trim() };
    }
  }
  return { where: text.trim(), orderBy: '' };
}

export function applyDateFilter(jql, input) {
  const filter = normalizeDateFilter(input);
  if (!filter) return String(jql || '');
  const { where, orderBy } = splitOrderBy(jql);
  const clause = dateClause(filter);
  const combined = where ? `(${where}) AND ${clause}` : clause;
  return orderBy ? `${combined} ${orderBy}` : combined;
}

export function describeDateFilter(input) {
  const filter = normalizeDateFilter(input);
  if (!filter) return '';
  const field = DATE_FIELDS.find(f => f.id === filter.field).label;
  if (filter.preset !== 'custom') return `${field} ${DATE_PRESETS.find(p => p.id === filter.preset).label.toLowerCase()}`;
  if (filter.from && filter.to) return `${field} ${filter.from} to ${filter.to}`;
  return filter.from ? `${field} from ${filter.from}` : `${field} up to ${filter.to}`;
}
