// Customer-chosen date ranges for Portal Reports exports. Only whitelisted
// fields and presets reach JQL, so customers cannot inject query text.

// Offered when a report has no customer filter settings saved yet.
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

/** Validates a preset or custom range; returns { preset, from?, to? } or throws. */
export function normalizeDateRange(input) {
  const preset = DATE_PRESETS.find(p => p.id === input?.preset);
  if (!preset) throw new Error('Choose a date range.');
  if (preset.id !== 'custom') return { preset: preset.id };

  const from = input.from ? parseIsoDate(input.from, 'From date') : null;
  const to = input.to ? parseIsoDate(input.to, 'To date') : null;
  if (!from && !to) throw new Error('Enter a from date, a to date, or both.');
  if (from && to && from > to) throw new Error('The from date must be on or before the to date.');
  if (from && to && (to - from) / 86400000 > MAX_CUSTOM_DAYS) throw new Error('Choose a date range of 10 years or less.');
  return { preset: 'custom', from: from ? isoDay(from) : null, to: to ? isoDay(to) : null };
}

/** JQL for a validated range on a trusted JQL field reference. */
export function buildDateClause(jqlField, range) {
  const f = jqlField;
  switch (range.preset) {
    case 'last7': return `${f} >= -7d`;
    case 'last30': return `${f} >= -30d`;
    case 'thisMonth': return `${f} >= startOfMonth()`;
    case 'lastMonth': return `${f} >= startOfMonth(-1) AND ${f} < startOfMonth()`;
    case 'custom': {
      const parts = [];
      if (range.from) parts.push(`${f} >= "${range.from}"`);
      if (range.to) {
        const next = new Date(`${range.to}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        parts.push(`${f} < "${isoDay(next)}"`); // inclusive of the whole "to" day
      }
      return parts.join(' AND ');
    }
    default: throw new Error('Unsupported date range.');
  }
}

export function describeDateRange(fieldLabel, range) {
  if (range.preset !== 'custom') return `${fieldLabel} ${DATE_PRESETS.find(p => p.id === range.preset).label.toLowerCase()}`;
  if (range.from && range.to) return `${fieldLabel} ${range.from} to ${range.to}`;
  return range.from ? `${fieldLabel} from ${range.from}` : `${fieldLabel} up to ${range.to}`;
}

/** Returns a clean filter on a standard date field, null when none was requested, or throws. */
export function normalizeDateFilter(input) {
  if (!input || typeof input !== 'object' || !input.field) return null;
  const field = DATE_FIELDS.find(f => f.id === input.field);
  if (!field) throw new Error('Choose a supported date field.');
  return { field: field.id, ...normalizeDateRange(input) };
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

/** ANDs trusted clauses onto a report's JQL, keeping its ORDER BY. */
export function applyClauses(jql, clauses = []) {
  const extra = clauses.filter(Boolean);
  if (!extra.length) return String(jql || '');
  const { where, orderBy } = splitOrderBy(jql);
  const combined = [where ? `(${where})` : '', ...extra].filter(Boolean).join(' AND ');
  return orderBy ? `${combined} ${orderBy}` : combined;
}

export function applyDateFilter(jql, input) {
  const filter = normalizeDateFilter(input);
  if (!filter) return String(jql || '');
  return applyClauses(jql, [buildDateClause(DATE_FIELDS.find(f => f.id === filter.field).jql, filter)]);
}

export function describeDateFilter(input) {
  const filter = normalizeDateFilter(input);
  if (!filter) return '';
  return describeDateRange(DATE_FIELDS.find(f => f.id === filter.field).label, filter);
}
