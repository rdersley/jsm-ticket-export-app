// Readable, customer-safe text for long Jira fields in Excel reports.
//
// Description and Comment come back from Jira as Atlassian Document Format, and
// Comment includes internal notes. Reports go to customers (email, Portal
// Reports), so comments are limited to the ones Jira marks as shared with the
// customer (jsdPublic === true). A comment without that flag counts as internal.

export const EXCERPT_LENGTH = 300;
// Excel's limit is 32,767 characters per cell.
const CELL_LIMIT = 32000;

// Report-only columns. They aren't Jira fields: the runner asks Jira for the
// source field instead and the workbook builds the value.
export const VIRTUAL_FIELDS = [
  { id: 'erm:descriptionExcerpt', name: 'Description (first 300 characters)', source: 'description' },
  { id: 'erm:latestPublicComment', name: 'Latest public comment', source: 'comment' },
  { id: 'erm:latestPublicCommentDate', name: 'Latest public comment date', source: 'comment' },
  // Whole days from created to resolved, or to now while the ticket is open.
  { id: 'erm:ageDays', name: 'Age (days)', source: ['created', 'resolutiondate'] }
];
const VIRTUAL_BY_ID = new Map(VIRTUAL_FIELDS.map(f => [f.id, f]));

// Cascading selects can also be exported as two columns, parent and child,
// alongside the combined "Parent - Child" column. Their ids carry the field:
// erm:cascadeParent:customfield_10300 / erm:cascadeChild:customfield_10300.
const CASCADE_PART = /^erm:cascade(Parent|Child):(customfield_\d+)$/;
export const cascadePart = id => {
  const match = String(id || '').match(CASCADE_PART);
  return match ? { part: match[1] === 'Parent' ? 'parent' : 'child', source: match[2] } : null;
};
export const cascadeColumns = ({ id, name }) => [
  { id: `erm:cascadeParent:${id}`, name: `${name} (parent)` },
  { id: `erm:cascadeChild:${id}`, name: `${name} (child)` }
];

export const isTextField = id => VIRTUAL_BY_ID.has(id) || Boolean(cascadePart(id)) || id === 'description' || id === 'comment';

// Jira field ids to search for, with report-only columns swapped for their source field.
export const searchFieldIds = ids => [...new Set(ids.flatMap(id => VIRTUAL_BY_ID.get(id)?.source || cascadePart(id)?.source || id))];

const DAY_MS = 86400000;

/** Whole days a ticket has been open: created to resolved, or to now. Blank without a created date. */
export function ageDays(fields = {}, now = Date.now()) {
  const created = Date.parse(fields.created || '');
  if (!Number.isFinite(created)) return '';
  const resolved = Date.parse(fields.resolutiondate || '');
  const end = Number.isFinite(resolved) ? resolved : now;
  return Math.max(0, Math.floor((end - created) / DAY_MS));
}

function adfText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return String(node.text || '');
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return String(node.attrs?.text || '');
  const inner = (Array.isArray(node.content) ? node.content : []).map(adfText).join('');
  return ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(node.type) ? `${inner}\n` : inner;
}

const fit = text => text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT)}…` : text;

export function plainText(value) {
  if (value == null) return '';
  const text = typeof value === 'object' ? adfText(value) : String(value);
  return text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

export function excerpt(value, max = EXCERPT_LENGTH) {
  const text = plainText(value).replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const cut = text.slice(0, max), space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function publicComments(commentField) {
  const comments = Array.isArray(commentField?.comments) ? commentField.comments : [];
  return comments
    .filter(c => c?.jsdPublic === true && plainText(c.body))
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
}

// Cell value for a description, comment or report-only column.
export function textFieldValue(fieldId, fields = {}, now = Date.now()) {
  if (fieldId === 'erm:ageDays') return ageDays(fields, now);
  const cascade = cascadePart(fieldId);
  if (cascade) {
    const value = fields[cascade.source];
    return String((cascade.part === 'parent' ? value?.value : value?.child?.value) ?? '');
  }
  if (fieldId === 'description') return fit(plainText(fields.description));
  if (fieldId === 'erm:descriptionExcerpt') return excerpt(fields.description);
  const shared = publicComments(fields.comment);
  const latest = shared[shared.length - 1];
  if (fieldId === 'erm:latestPublicComment') return latest ? excerpt(latest.body) : '';
  if (fieldId === 'erm:latestPublicCommentDate') return latest ? String(latest.created || '') : '';
  if (fieldId === 'comment') {
    return fit(shared.map(c => `${String(c.created || '').slice(0, 10)} ${c.author?.displayName || ''}: ${plainText(c.body)}`.replace(/^ +| +(?=:)/g, '')).join('\n\n'));
  }
  return '';
}
