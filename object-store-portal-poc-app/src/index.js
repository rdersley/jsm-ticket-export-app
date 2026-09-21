import Resolver from '@forge/resolver';
import fos from '@forge/object-store';
import crypto from 'node:crypto';

const OBJECT_KEY = 'portal-poc/latest-report.xlsx';
const resolver = new Resolver();

async function buildTestFile() {
  // Deliberately avoid ExcelJS in this isolated POC. The goal is to prove
  // Object Store upload/download + portal consent behaviour only.
  return Buffer.from(
    'Nuvriqo Object Store Portal POC\n' +
    'Generated: ' + new Date().toISOString() + '\n' +
    'This file proves backend-generated content can be stored and downloaded without a JSM ticket.\n',
    'utf8'
  );
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
      'content-type': 'application/octet-stream'
    },
    body: buffer
  });
  if (!response.ok) throw new Error(`Object Store upload failed (${response.status}).`);
}

resolver.define('poc:publish', async () => {
  const buffer = await buildTestFile();
  await uploadObject(OBJECT_KEY, buffer);
  const metadata = await fos.get(OBJECT_KEY).catch(() => null);
  return {
    ok: true,
    key: OBJECT_KEY,
    filename: 'Object Store Portal Test.xlsx',
    bytes: buffer.length,
    metadata
  };
});

export const adminHandler = resolver.getDefinitions();

const objectResolver = new Resolver();

objectResolver.define('object-download', async ({ payload }) => {
  const keys = Array.isArray(payload) ? payload : (Array.isArray(payload?.keys) ? payload.keys : []);
  const allowed = new Set([OBJECT_KEY]);
  const map = {};
  for (const key of keys) {
    if (!allowed.has(String(key))) continue;
    const result = await fos.createDownloadUrl(String(key));
    if (result?.url) map[result.url] = String(key);
  }
  return map;
});

export const objectHandler = objectResolver.getDefinitions();
