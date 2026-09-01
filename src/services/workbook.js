import ExcelJS from 'exceljs';

const display = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(display).filter(v => v !== '').join(', ');
  if (value.displayName) return value.displayName;
  if (value.name) return value.name;
  if (value.value != null && typeof value.value !== 'object') return value.value;
  if (value.key) return value.key;
  if (value.votes != null && typeof value.votes !== 'object') return value.votes;
  if (value.count != null && typeof value.count !== 'object') return value.count;
  if (value.total != null && typeof value.total !== 'object') return value.total;
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

export async function buildWorkbook(report, issues) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nuvriqo Excel Report Manager';
  wb.created = new Date();

  const options = report.template?.workbook || {};
  const columns = report.template?.columns || [];
  const ws = wb.addWorksheet(safeSheetName(options.sheetName));

  const fontName = options.fontName || 'Aptos';
  const bodyFontSize = clamp(options.bodyFontSize, 8, 18, 11);
  const headerFontSize = clamp(options.headerFontSize, 8, 24, 11);
  const rowHeight = clamp(options.rowHeight, 14, 40, 20);
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
    cell.font = {
      name: fontName,
      size: headerFontSize,
      bold: options.headerBold !== false,
      color: { argb: headerTextColor }
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBackground } };
    cell.alignment = { vertical: 'middle', horizontal: alignment };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } }
    };
  });
  ws.getRow(headerRow).height = Math.max(22, rowHeight);

  let rowIndex = headerRow;
  for (const issue of issues) {
    const row = ws.getRow(++rowIndex);
    row.height = rowHeight;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const raw = c.fieldId === 'key' ? issue.key : issue.fields?.[c.fieldId];
      cell.value = display(raw);
      cell.font = { name: fontName, size: bodyFontSize, color: { argb: bodyTextColor } };
      cell.alignment = { vertical: 'middle' };

      if (c.fieldId === 'key' && options.jiraLinks !== false && issue.self) {
        const base = issue.self.split('/rest/api/')[0];
        cell.value = { text: issue.key, hyperlink: `${base}/browse/${issue.key}` };
        cell.font = {
          name: fontName,
          size: bodyFontSize,
          color: { argb: 'FF0C66E4' },
          underline: true
        };
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

  if (options.freezeHeader !== false) ws.views = [{ state: 'frozen', ySplit: headerRow }];
  if (options.autoFilter !== false && columns.length) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: columns.length }
    };
  }

  return wb.xlsx.writeBuffer();
}
