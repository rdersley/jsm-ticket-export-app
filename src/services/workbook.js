import ExcelJS from 'exceljs';

const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;
const isIssueLinkColumn = column => column?.fieldId === 'issuelinks' || /(?:linked?\s*issues?|issue\s*links?)/i.test(String(column?.label || ''));

const parseJsonValue = value => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!(text.startsWith('{') || text.startsWith('['))) return value;
  try { return JSON.parse(text); } catch { return value; }
};

const collectIssueLinks = (input, relation = '', output = [], seen = new Set(), depth = 0) => {
  if (input == null || depth > 10) return output;

  const value = parseJsonValue(input);
  if (value !== input) return collectIssueLinks(value, relation, output, seen, depth + 1);
  if (typeof value !== 'object') return output;

  if (Array.isArray(value)) {
    value.forEach(item => collectIssueLinks(item, relation, output, seen, depth + 1));
    return output;
  }

  if (value.outwardIssue) {
    collectIssueLinks(value.outwardIssue, value.type?.outward || value.type?.name || 'links to', output, seen, depth + 1);
  }
  if (value.inwardIssue) {
    collectIssueLinks(value.inwardIssue, value.type?.inward || value.type?.name || 'linked from', output, seen, depth + 1);
  }

  const key = String(value.key || value.issueKey || '').trim();
  if (JIRA_KEY.test(key)) {
    const normalizedKey = key.toUpperCase();
    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      output.push(normalizedKey);
    }
    return output;
  }

  const knownWrappers = ['issue', 'linkedIssue', 'target', 'source', 'destination', 'value', 'values', 'items', 'results'];
  knownWrappers.forEach(name => {
    if (value[name] != null) collectIssueLinks(value[name], relation, output, seen, depth + 1);
  });

  if (!output.length) {
    Object.entries(value).forEach(([name, child]) => {
      if (!['type', 'self', 'id'].includes(name) && child && typeof child === 'object') {
        collectIssueLinks(child, relation, output, seen, depth + 1);
      }
    });
  }
  return output;
};

const displayIssueLinks = value => {
  const links = collectIssueLinks(value);
  return links.length ? links.join('\n') : null;
};

const issueLinkDisplay = value => {
  const links = displayIssueLinks(value);
  return links || null;
};

const display = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(display).filter(v => v !== '').join(', ');

  const linkedIssue = issueLinkDisplay(value);
  if (linkedIssue) return linkedIssue;

  // Cascading selects hold the child option under the parent: "Parent - Child".
  if (value.child?.value != null && value.value != null) return `${value.value} - ${value.child.value}`;
  if (value.displayName) return value.displayName;
  if (value.name) return value.name;
  if (value.value != null && typeof value.value !== 'object') return value.value;
  if (value.key) return value.key;
  if (value.votes != null && typeof value.votes !== 'object') return value.votes;
  if (value.count != null && typeof value.count !== 'object') return value.count;
  if (value.total != null && typeof value.total !== 'object') return value.total;
  if (value.emailAddress) return value.emailAddress;
  if (value.url) return value.url;
  return JSON.stringify(value);
};

const safeSheetName = value => (value || 'Issues').replace(/[\\/*?:\[\]]/g, ' ').slice(0,31) || 'Issues';
const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number(value) || fallback));
const argb = (value, fallback) => {
  const clean = String(value || fallback || '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `FF${clean.toUpperCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(clean)) return clean.toUpperCase();
  return String(fallback || 'FF172B4D').replace('#', '').padStart(8, 'F').toUpperCase();
};
const looksLikeDateField = id => /(date|time|created|updated|resolved|due|start)/i.test(String(id || ''));
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);

export async function buildWorkbook(report, issues) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nuvriqo Excel Report Manager';
  wb.created = new Date();

  const options = report.template?.workbook || {};
  const columns = report.template?.columns || [];
  const ws = wb.addWorksheet(safeSheetName(options.sheetName), {
    views: [{ showGridLines: options.showGridLines === true }],
    pageSetup: {
      orientation: options.orientation === 'portrait' ? 'portrait' : 'landscape',
      fitToPage: options.fitToPage !== false,
      fitToWidth: options.fitToPage !== false ? 1 : undefined,
      fitToHeight: 0
    }
  });

  const fontName = options.fontName || 'Aptos';
  const bodyFontSize = clamp(options.bodyFontSize, 8, 18, 11);
  const headerFontSize = clamp(options.headerFontSize, 8, 24, 11);
  const rowHeight = clamp(options.rowHeight, 14, 60, 20);
  const bodyTextColor = argb(options.bodyTextColor, 'FF172B4D');
  const headerBackground = argb(options.headerBackground, 'FF0C66E4');
  const headerTextColor = argb(options.headerTextColor, 'FFFFFFFF');
  const alternateRowBackground = argb(options.alternateRowBackground, 'FFF7F8F9');
  const alignment = ['left', 'center', 'right'].includes(options.headerAlignment) ? options.headerAlignment : 'left';

  const headerRow = 1;
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(8, Math.min(80, Number(c.width) || 20));
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.label || c.fieldId;
    cell.font = { name: fontName, size: headerFontSize, bold: options.headerBold !== false, color: { argb: headerTextColor } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBackground } };
    cell.alignment = { vertical: 'middle', horizontal: alignment, wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } } };
  });
  ws.getRow(headerRow).height = Math.max(22, rowHeight);

  let rowIndex = headerRow;
  for (const issue of issues) {
    const row = ws.getRow(++rowIndex);
    row.height = rowHeight;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const raw = c.fieldId === 'key' ? issue.key : issue.fields?.[c.fieldId];
      const linkValue = isIssueLinkColumn(c) ? displayIssueLinks(raw) : null;
      const shown = linkValue ?? display(raw);
      if (options.autoDateFormat !== false && looksLikeDateField(c.fieldId) && isoDate(shown)) {
        cell.value = new Date(shown);
        cell.numFmt = options.dateFormat || 'dd/mm/yyyy hh:mm';
      } else {
        cell.value = shown;
      }
      cell.font = { name: fontName, size: bodyFontSize, color: { argb: bodyTextColor } };
      cell.alignment = { vertical: 'top', wrapText: options.wrapText !== false };

      if (c.fieldId === 'key' && options.jiraLinks !== false && issue.self) {
        const base = issue.self.split('/rest/api/')[0];
        cell.value = { text: issue.key, hyperlink: `${base}/browse/${issue.key}` };
        cell.font = { name: fontName, size: bodyFontSize, color: { argb: 'FF0C66E4' }, underline: true };
      } else if (typeof shown === 'string' && /^https?:\/\//i.test(shown)) {
        cell.value = { text: shown, hyperlink: shown };
        cell.font = { name: fontName, size: bodyFontSize, color: { argb: 'FF0C66E4' }, underline: true };
      }

      if (options.alternateRows !== false && rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alternateRowBackground } };
      }
    });
  }

  if (options.footerInfo !== false) {
    let footerRow = rowIndex + 2;
    const span = Math.max(1, columns.length);
    const reportTitle = (options.title || report.name || '').trim();
    if (reportTitle) {
      ws.mergeCells(footerRow, 1, footerRow, span);
      const cell = ws.getCell(footerRow, 1);
      cell.value = `Report: ${reportTitle}`;
      cell.font = { name: fontName, size: bodyFontSize, bold: true, color: { argb: bodyTextColor } };
      footerRow++;
    }
    if (options.subtitle) {
      ws.mergeCells(footerRow, 1, footerRow, span);
      const cell = ws.getCell(footerRow, 1);
      cell.value = options.subtitle;
      cell.font = { name: fontName, size: bodyFontSize, italic: true, color: { argb: bodyTextColor } };
      footerRow++;
    }
    if (options.generatedAt !== false) {
      ws.mergeCells(footerRow, 1, footerRow, span);
      const cell = ws.getCell(footerRow, 1);
      cell.value = `Generated: ${new Date().toLocaleString('en-IE')}`;
      cell.font = { name: fontName, size: Math.max(8, bodyFontSize - 1), italic: true, color: { argb: 'FF6B778C' } };
    }
  }

  if (options.freezeHeader !== false) ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: options.showGridLines === true }];
  if (options.autoFilter !== false && columns.length) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };
  }
  ws.properties.defaultRowHeight = rowHeight;
  return wb.xlsx.writeBuffer();
}
