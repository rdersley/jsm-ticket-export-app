import ExcelJS from 'exceljs';

const display = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(', ');
  if (value.displayName) return value.displayName;
  if (value.name) return value.name;
  if (value.value) return value.value;
  if (value.key) return value.key;
  return JSON.stringify(value);
};

const safeSheetName = value => (value || 'Issues').replace(/[\\/*?:\[\]]/g, ' ').slice(0,31) || 'Issues';

export async function buildWorkbook(report, issues) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nuvriqo Excel Report Manager';
  wb.created = new Date();
  const options = report.template?.workbook || {};
  const ws = wb.addWorksheet(safeSheetName(options.sheetName));
  const columns = report.template?.columns || [];
  let rowIndex = 1;

  if (options.title) {
    ws.mergeCells(rowIndex, 1, rowIndex, Math.max(1, columns.length));
    const cell = ws.getCell(rowIndex, 1); cell.value = options.title; cell.font = { bold: true, size: 18 };
    rowIndex++;
  }
  if (options.subtitle) {
    ws.mergeCells(rowIndex, 1, rowIndex, Math.max(1, columns.length));
    ws.getCell(rowIndex, 1).value = options.subtitle;
    rowIndex++;
  }
  if (options.generatedAt !== false) {
    ws.mergeCells(rowIndex, 1, rowIndex, Math.max(1, columns.length));
    ws.getCell(rowIndex, 1).value = `Generated ${new Date().toLocaleString('en-IE')}`;
    ws.getCell(rowIndex, 1).font = { italic: true, size: 10 };
    rowIndex += 2;
  }

  const headerRow = rowIndex;
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(8, Math.min(80, Number(c.width) || 20));
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.label || c.fieldId;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle' };
  });

  for (const issue of issues) {
    const row = ws.getRow(++rowIndex);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const raw = c.fieldId === 'key' ? issue.key : issue.fields?.[c.fieldId];
      cell.value = display(raw);
      if (c.fieldId === 'key' && options.jiraLinks !== false && issue.self) {
        const base = issue.self.split('/rest/api/')[0];
        cell.value = { text: issue.key, hyperlink: `${base}/browse/${issue.key}` };
        cell.font = { underline: true };
      }
      if (options.alternateRows && rowIndex % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8F9' } };
    });
  }

  if (options.freezeHeader !== false) ws.views = [{ state: 'frozen', ySplit: headerRow }];
  if (options.autoFilter !== false && columns.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };
  ws.getRow(headerRow).height = 22;
  return wb.xlsx.writeBuffer();
}
