import Resolver from '@forge/resolver';
import fos from '@forge/object-store';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';

const OBJECT_KEY = 'portal-poc/latest-report.xlsx';
const resolver = new Resolver();

async function buildWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  ws.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 70 }
  ];
  ws.addRow({ field: 'Test', value: 'Forge Object Store customer portal proof of concept' });
  ws.addRow({ field: 'Generated', value: new Date().toISOString() });
  ws.addRow({ field: 'Purpose', value: 'Prove a portal customer can download a backend-generated XLSX without a JSM ticket and without granting app access.' });
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function uploadObject(key, buffer) {
  const checksum = crypto.createHash('sha256').update(buffer).digest('base64');
  const created = await fos.createUploadUrl({
    key,
    length: buffer.length,
    checksum,
    checksumType: 'SHA256',
    overwrite: true
  });
  if (!created?.url) throw new Error('Object Store did not return an upload URL.');

  const response = await fetch(created.url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    body: buffer
  });
  if (!response.ok) throw new Error(`Object Store upload failed (${response.status}).`);
}

resolver.define('poc:publish', async () => {
  const buffer = await buildWorkbook();
  await uploadObject(OBJECT_KEY, buffer);
  const metadata = await fos.getMetadata(OBJECT_KEY).catch(() => null);
  return {
    ok: true,
    key: OBJECT_KEY,
    filename: 'Object Store Portal Test.xlsx',
    bytes: buffer.length,
    metadata
  };
});

export const adminHandler = resolver.getDefinitions();

export async function generateDownloadUrls(keys = []) {
  const allowed = new Set([OBJECT_KEY]);
  const map = {};
  for (const key of Array.isArray(keys) ? keys : []) {
    if (!allowed.has(String(key))) continue;
    const result = await fos.createDownloadUrl(String(key));
    if (result?.url) map[result.url] = String(key);
  }
  return map;
}
