// Per-report customer filters for Portal Reports. The report creator picks
// which date and choice fields (and which choice values) customers may filter
// on; customers can only select from that list, so JQL is built entirely from
// server-side configuration.
import { DATE_FIELDS, DATE_PRESETS, normalizeDateRange, buildDateClause, describeDateRange } from './dateFilter.js';

export const CHOICE_SYSTEM_FIELDS = [
  { id: 'status', label: 'Status', jql: 'status' },
  { id: 'priority', label: 'Priority', jql: 'priority' },
  { id: 'resolution', label: 'Resolution', jql: 'resolution' },
  { id: 'issuetype', label: 'Work type', jql: 'issuetype' }
];

const MAX_DATE_FIELDS = 10;
const MAX_CHOICE_FIELDS = 8;
const MAX_VALUES = 200;
const MAX_LABEL = 80;
const VALUE_ID = /^\d{1,18}$/;
const CUSTOM_FIELD_ID = /^customfield_(\d{1,10})$/;

const cleanLabel = (value, fallback) => String(value || fallback || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

/** Trusted JQL reference for a field id, or null when the field is not filterable. */
export function jqlFieldFor(fieldId, kind) {
  const id = String(fieldId || '');
  const custom = id.match(CUSTOM_FIELD_ID);
  if (custom) return `cf[${custom[1]}]`;
  const system = (kind === 'date' ? DATE_FIELDS : CHOICE_SYSTEM_FIELDS).find(f => f.id === id);
  return system ? system.jql : null;
}

/**
 * Cleans admin-saved filter settings. Returns null when nothing has been
 * saved yet, so existing reports keep the standard date fields.
 */
export function normalizeFilterConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seen = new Set();
  const dateFields = (Array.isArray(raw.dateFields) ? raw.dateFields : [])
    .map(f => ({ id: String(f?.id || ''), label: cleanLabel(f?.label, f?.id) }))
    .filter(f => jqlFieldFor(f.id, 'date') && !seen.has(`d:${f.id}`) && seen.add(`d:${f.id}`))
    .slice(0, MAX_DATE_FIELDS);
  const choices = (Array.isArray(raw.choices) ? raw.choices : [])
    .map(f => {
      const valueSeen = new Set();
      const values = (Array.isArray(f?.values) ? f.values : [])
        .map(v => ({ id: String(v?.id || ''), label: cleanLabel(v?.label, v?.id) }))
        .filter(v => VALUE_ID.test(v.id) && !valueSeen.has(v.id) && valueSeen.add(v.id))
        .slice(0, MAX_VALUES);
      return { id: String(f?.id || ''), label: cleanLabel(f?.label, f?.id), values };
    })
    .filter(f => jqlFieldFor(f.id, 'choice') && f.values.length && !seen.has(`c:${f.id}`) && seen.add(`c:${f.id}`))
    .slice(0, MAX_CHOICE_FIELDS);
  return { dateFields, choices };
}

/** The filter settings in force for a report (saved, or the standard defaults). */
export function effectiveFilterConfig(raw) {
  return normalizeFilterConfig(raw) || {
    dateFields: DATE_FIELDS.map(({ id, label }) => ({ id, label })),
    choices: []
  };
}

/** What the portal card shows: labels and allowed values only. */
export function customerFilterOptions(raw) {
  const config = effectiveFilterConfig(raw);
  return {
    dateFields: config.dateFields,
    presets: DATE_PRESETS,
    choices: config.choices.map(({ id, label, values }) => ({ id, label, values }))
  };
}

/**
 * Validates a customer's selection against the report's filter settings.
 * Accepts { date: { field, preset, from, to }, choices: { [fieldId]: [valueId] } }
 * or the older { field, preset, from, to } date-only shape.
 * Returns { clauses, labels } or null when nothing was selected.
 */
export function resolveCustomerFilters(input, rawConfig) {
  if (!input || typeof input !== 'object') return null;
  const config = effectiveFilterConfig(rawConfig);
  const selection = 'date' in input || 'choices' in input ? input : { date: input };
  const clauses = [];
  const labels = [];

  const date = selection.date;
  if (date && typeof date === 'object' && date.field) {
    const field = config.dateFields.find(f => f.id === String(date.field));
    if (!field) throw new Error('That date field is not available for this report.');
    const range = normalizeDateRange(date);
    clauses.push(buildDateClause(jqlFieldFor(field.id, 'date'), range));
    labels.push(describeDateRange(field.label, range));
  }

  const choices = selection.choices && typeof selection.choices === 'object' ? selection.choices : {};
  for (const [fieldId, rawValues] of Object.entries(choices)) {
    const values = [...new Set((Array.isArray(rawValues) ? rawValues : []).map(String))];
    if (!values.length) continue;
    const field = config.choices.find(f => f.id === fieldId);
    if (!field) throw new Error('That filter is not available for this report.');
    const picked = values.map(id => field.values.find(v => v.id === id));
    if (picked.some(v => !v)) throw new Error(`Choose ${field.label} values from the list.`);
    clauses.push(`${jqlFieldFor(field.id, 'choice')} in (${picked.map(v => v.id).join(', ')})`);
    labels.push(`${field.label} ${picked.map(v => v.label).join(', ')}`);
  }

  return clauses.length ? { clauses, labels } : null;
}
